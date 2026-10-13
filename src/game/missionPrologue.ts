import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { AIPilot, RoutePilot } from '../entities/ai';
import { SHIP_CLASSES, type ShipClass } from '../entities/shipClasses';
import { launchFrom } from './missionFinale';
import { makeGate } from './missionCivil';

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
  if (g.tutorial) {
    // the caravan waits at the start while Dace shows you the ropes
    for (const rp of pilots) rp.hold = true;
    await flightSchool(g, player, dace);
    for (const rp of pilots) rp.hold = false;
  }
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

  // --- Vey's pack: hard, but the escorts can still hold ----------------------------------------
  g.setMusicIntensity(0.85);
  const ahead = luck.pos.clone().add(v(0, 60, -900));
  const w2: Ship[] = [];
  for (let i = 0; i < 3; i++) w2.push(g.jumpIn('fang', 'wake', 'Wake Fang', ahead.clone().add(v(-140 + i * 140, 90, 120)), luck.pos, { skill: 0.5, playerBias: 0.55, flares: 2 }));
  for (let i = 0; i < 4; i++) w2.push(g.jumpIn('drone', 'wake', 'Wake drone', ahead.clone().add(v((i % 2) * 60 - 30, 140 + Math.floor(i / 2) * 40, 60)), luck.pos, { skill: 0.4, playerBias: 0.4 }));
  await g.say('vey', 'Nice little caravan. Shame about the escort.');
  await g.say('dace', 'Fangs. Those are Vey\'s own. Stay close to the haulers, Rook, they are faster than us.');
  const w2Start = g.missionTime;
  await g.until(() => {
    g.objective = `Protect the caravan · ${alive(w2)} raiders left`;
    return alive(w2) === 0 || g.missionTime > w2Start + 90;
  });
  g.retreat(w2.filter((s) => s.alive));
  g.setMusicIntensity(0.4);
  await g.say('tamsin', 'They are breaking off! I think we did it. Rook, Dace, I could kiss you both.');
  await g.wait(2);

  // --- the one nobody could handle: Vey brings the fleet ------------------------------------------
  await g.say('vey', 'Enough games. Bring them in.');
  g.setMusicIntensity(1);
  const fleetAt = luck.pos.clone().add(v(-300, 420, -1500));
  const bc = g.spawnCapital('battlecruiser', 'wake', 'redtithe', 'Red Tithe', fleetAt.clone(), luck.pos, { armed: true, skill: 0.45 });
  const carrier = g.spawnCapital('carrier', 'wake', 'hollowcrown', 'Hollow Crown', fleetAt.clone().add(v(1300, -120, 300)), luck.pos, { armed: true, skill: 0.4 });
  g.fx.jumpIn(bc.root.position, v(0, 0, 1), '#ff5a3a');
  g.fx.jumpIn(carrier.root.position, v(0, 0, 1), '#ff5a3a');
  g.audio.jumpIn(bc.root.position);
  const brute = g.jumpIn('brute', 'wake', 'Mawbreaker', ahead.clone().add(v(0, -40, 0)), luck.pos, { skill: 0.6, playerBias: 0.2 });
  if (brute.ai instanceof AIPilot) brute.ai.forcedTarget = halcyon;
  const pack: Ship[] = [brute];
  pack.push(...launchFrom(g, carrier, ['raider', 'raider', 'fang', 'raider', 'fang', 'raider', 'fang', 'raider'], 'wake', 'Wake raider', { skill: 0.55, playerBias: 0.6, tactic: 'swarm', missiles: 3 }));
  for (let i = 0; i < 12; i++) pack.push(g.jumpIn('drone', 'wake', 'Wake drone', player.pos.clone().add(v((i % 4) * 60 - 90, 120 + Math.floor(i / 4) * 40, -500)), player.pos, { skill: 0.45, playerBias: 0.7 }));
  const daceHunter = pack[2].ai;
  if (daceHunter instanceof AIPilot) daceHunter.forcedTarget = dace;
  await g.say('dace', 'That is a battlecruiser. And a carrier. Where does a pirate get a battlecruiser? Mara, run! Burn for the rocks!');
  await g.say('tamsin', 'Burning! All haulers, everything you have!');
  g.objective = 'Protect the caravan';
  const start = g.missionTime;
  let daceDown = false;
  let halcyonDown = false;
  await g.until(() => {
    g.objective = `Protect the caravan · ${alive(caravan)} of 3 ships`;
    if (!daceDown && (g.missionTime > start + 14 || !dace.alive)) {
      daceDown = true;
      void (async () => {
        if (dace.alive) {
          await g.say('dace', 'I am hit, I am hit! Rook, I cannot shake him!');
          if (dace.alive) {
            dace.damageScale = 1;
            g.onShipHit(dace, 1e6, pack[2], dace.pos.clone(), 'missile');
          }
        }
        await g.say('tamsin', 'Dace! Dace, answer me!');
      })().catch(() => undefined);
    }
    if (!halcyonDown && g.missionTime > start + 26) {
      halcyonDown = true;
      if (halcyon.alive) g.onShipHit(halcyon, 1e6, brute, halcyon.pos.clone(), 'missile');
      void g.say('tamsin', 'Halcyon is gone. Oh, God. Rook, get them off the Luck!').catch(() => undefined);
    }
    // ends when the Kite is crippled, or the fight has gone on long enough that it would have been
    return player.hull <= player.hullFloor + 0.5 || g.missionTime > start + 70;
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
  g.armCapital(bc, false);
  g.armCapital(carrier, false);
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

/**
 * The flight introduction, if you asked for it: Dace talks you through flying, fighting and the
 * ship's systems one step at a time, each step done by doing it.
 */
async function flightSchool(g: Game, player: Ship, dace: Ship): Promise<void> {
  const pad = () => g.input.device === 'gamepad';
  const key = (a: Parameters<typeof g.input.label>[0]) => g.input.label(a);
  const fwd = () => player.forward(new THREE.Vector3());
  const step = async (objective: string, hint: string, done: () => boolean, timeout = 60) => {
    g.objective = `Flight school · ${objective}`;
    g.hint(hint, 12);
    const until = g.missionTime + timeout;
    await g.until(() => done() || g.missionTime > until);
    g.audio.blip(1500, 0.08, 0.08);
    await g.wait(0.8);
  };
  const gateRun = async (dist: number, label: string, hint: string, extra: () => boolean = () => true) => {
    const at = player.pos.clone().addScaledVector(fwd(), dist).add(v(0, 40, 0));
    const gate = makeGate(at, fwd(), 22);
    g.addDecor(gate);
    g.waypoints = [{ name: label, pos: at, color: '#ffd36b' }];
    let seen = false;
    await step(label, hint, () => {
      if (extra()) seen = true;
      return player.pos.distanceTo(at) < 26 && seen;
    }, 90);
    gate.visible = false;
    g.waypoints = [];
  };
  dace.ai = null;
  await g.say('dace', 'Rook, before we set off. Mara wants me to run you through the Kite. Humour me.');

  await gateRun(
    350,
    'fly through the gate',
    pad()
      ? 'Right stick steers. Left stick: up and down is throttle, left and right is roll'
      : `${g.input.settings.mouseMode === 'aim' ? 'Move the mouse to aim: the ship turns to follow the circle' : 'The mouse steers'}. ${key('throttleUp')} and ${key('throttleDown')} set the throttle, ${key('rollLeft')} and ${key('rollRight')} roll`,
  );
  await g.say('dace', 'Good. Now open her up. Boost to the next gate.');
  await gateRun(700, 'boost to the gate', pad() ? 'Hold A to boost. It burns energy, the purple bar' : `Hold ${key('boost')} to boost. It burns energy, the purple bar`, () => player.boosting);
  await g.say('dace', 'Now the trick that keeps you alive. Slide: you keep your momentum and point the nose anywhere.');
  let slid = 0;
  let slideClock = g.missionTime;
  await step(
    'slide and turn',
    pad() ? 'Hold LT to slide, and turn while you hold it' : `Hold ${key('slide')} to slide, and turn while you hold it`,
    () => {
      if (player.sliding) slid += g.missionTime - slideClock;
      slideClock = g.missionTime;
      return slid > 1.5;
    },
  );

  // targets: three drones, hulks with the guns pulled out
  await g.say('dace', 'Guns. I put out three dead drones for you. Target one, lead it, and shoot.');
  const targets: Ship[] = [];
  for (let i = 0; i < 3; i++) {
    const s = g.spawnShip('drone', 'wake', 'Practice drone', player.pos.clone().addScaledVector(fwd(), 450).add(v(i * 60 - 60, 30 + i * 15, 0)), player.pos, { speed: 0 });
    s.ai = null;
    targets.push(s);
  }
  await step(
    'shoot the practice drones',
    pad()
      ? 'Y: target nearest · RT: fire · aim at the yellow diamond: it leads the target'
      : `${key('targetNearest')}: target nearest · ${key('fire')}: fire · aim at the yellow diamond: it leads the target`,
    () => targets.every((s) => !s.alive),
    120,
  );
  await g.say('dace', 'Missiles next. This one moves. Keep it in your sights until the lock tone, then fire.');
  const mover = g.spawnShip('drone', 'wake', 'Practice drone', player.pos.clone().addScaledVector(fwd(), 600).add(v(0, 60, 0)), player.pos, { speed: 30 });
  const c0 = mover.pos.clone();
  mover.ai = new RoutePilot([c0.clone().add(v(200, 0, 0)), c0.clone().add(v(200, 0, 200)), c0.clone().add(v(0, 0, 200)), c0.clone(), c0.clone().add(v(200, 0, 0))], 0.4, 40);
  await step(
    'lock on and fire a missile',
    pad() ? 'Target it, keep it in your sights until the lock tone, then RB fires a missile' : `Target it, keep it in your sights until the lock tone, then ${key('missile')} fires a missile`,
    () => !mover.alive,
    90,
  );
  if (mover.alive) g.onShipHit(mover, 1e6, null, mover.pos.clone(), 'missile');
  await g.say('dace', 'If someone does that to you, drop a flare. You have two built in, and they come back. Try one.');
  const flares = player.flares;
  await step('drop a flare', pad() ? 'Press B to drop a flare' : `Press ${key('flares')} to drop a flare`, () => player.flares < flares);
  await g.say('dace', 'Power. Send it to shields, guns or engines when you need it, and back to balanced after.');
  const power = player.power;
  await step('change your power setting', pad() ? 'D-pad cycles power: balanced, shields, guns, engines' : `${key('powerBalanced')}: balanced · ${key('powerShields')}: shields · ${key('powerGuns')}: guns · ${key('powerEngines')}: engines`, () => player.power !== power);
  await g.say('dace', 'Last one. The scanner shows you everyone out here, friend or foe. Find me with it.');
  await step(
    'scan the area',
    pad() ? 'Press the scan button to step through everything nearby' : `${key('scan')}: step through everything in the system · ${key('scanTarget')}: target what you scanned · ${key('matchSpeed')}: match its speed`,
    () => g.scanReadout !== null,
  );
  await g.wait(2);
  const dai = new AIPilot(g, 0.55);
  dai.playerBias = 0;
  dace.ai = dai;
  g.objective = '';
  await g.say('dace', 'That is everything I know. Well, everything useful. Let us catch up with Mara.');
}
