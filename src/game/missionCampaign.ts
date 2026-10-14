import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { AIPilot, RoutePilot } from '../entities/ai';
import { SHIP_CLASSES, type ShipClass } from '../entities/shipClasses';
import type { Campaign } from './loadout';
import { launchFrom } from './missionFinale';

/**
 * The middle of both campaigns. The same five missions are flown from either side, the way Open
 * Channel and the Accord are, and they follow the shape of the old campaign games: the first
 * jobs prove you can be trusted and hint that something is wrong (TIE Fighter's loyal missions
 * with a traitor underneath), then you are told the plan, then you are the one who makes it
 * possible (FreeSpace 2's beacons and broadsides) before the finale.
 *
 *  2. Credentials      escort your new side's convoy; someone wants to look inside it
 *  4. Loose Ends       the Wake courier with the second copy of the records: kill it or save it
 *  7. Sealed Orders    defend your side's home from a raid, then hear the plan
 *  8. Keys to the Door a quiet job: plant taps without being seen
 * 10. Lantern          lay the jump beacons for the fleet that ends it
 *
 * Chapter 5, Free Port (missionFreePort.ts), sits between Loose Ends and Open Channel.
 */

type Side = 'combine' | 'drift';
const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const alive = (ships: Ship[]): number => ships.filter((s) => s.alive && s.pos.length() < 6000).length;
const frac = (s: Ship): number => (s.hull + s.shields) / (s.cls.hull + s.cls.shields);
const other = (side: Side): Side => (side === 'combine' ? 'drift' : 'combine');
/** Seconds since the last call: for timers kept inside `until` checks (which run once a frame). */
const ticker = (g: Game): (() => number) => {
  let last = g.missionTime;
  return () => {
    const d = g.missionTime - last;
    last = g.missionTime;
    return d;
  };
};

/** Flies alongside another ship, matching its course: inspectors shadowing a hauler. */
class Shadow {
  constructor(
    private readonly target: Ship,
    private readonly offset: THREE.Vector3,
  ) {}
  update(ship: Ship): void {
    const c = ship.controls;
    c.fire = false;
    c.missile = false;
    c.boost = false;
    c.slide = false;
    const goal = this.target.pos.clone().add(this.offset);
    const to = goal.sub(ship.pos);
    const d = to.length();
    const local = to.normalize().applyQuaternion(ship.quat.clone().invert());
    c.pitch = Math.max(-1, Math.min(1, Math.atan2(local.y, -local.z) * 2.5));
    c.yaw = Math.max(-1, Math.min(1, Math.atan2(local.x, -local.z) * 2.5));
    c.roll = 0;
    c.throttle = Math.max(0.15, Math.min(1, this.target.speed / ship.cls.maxSpeed + d / 300));
  }
}

/** Cargo ships you escort: shootable, unlike traffic. */
const TRANSPORT: ShipClass = { ...SHIP_CLASSES.container, civilian: false, targetable: true, shields: 600, shieldRegen: 6, shieldDelay: 4, hull: 2600, maxSpeed: 36, boostSpeed: 36 };

/** A fighter squadron of one side's stock hulls. */
function wing(side: Side, n: number, heavy = false): string[] {
  const light = side === 'combine' ? 'sabre' : 'gannet';
  const big = side === 'combine' ? 'halberd' : 'bulwark';
  return Array.from({ length: n }, (_, i) => (heavy && i % 3 === 2 ? big : light));
}

/** Fighters jumping in around a point. */
function jumpWing(g: Game, side: Side, classes: string[], name: string, at: THREE.Vector3, look: THREE.Vector3, opts: { skill?: number; playerBias?: number } = {}): Ship[] {
  return classes.map((cls, i) => {
    const s = g.jumpIn(cls, side, name, at.clone().add(v((i % 3) * 50 - 50, (i % 2) * 30, Math.floor(i / 3) * 50)), look, { skill: opts.skill ?? 0.55, playerBias: opts.playerBias ?? 0.5, flares: 1 });
    s.missiles = Math.min(s.missiles, 3);
    return s;
  });
}

function wakeRaid(g: Game, at: THREE.Vector3, look: THREE.Vector3, cutters: number, fangs: number, drones: number): Ship[] {
  const out: Ship[] = [];
  let k = 0;
  const spot = () => at.clone().add(v((k % 4) * 45 - 70, (k++ % 3) * 25, Math.floor(k / 4) * 40));
  for (let i = 0; i < cutters; i++) out.push(g.jumpIn('raider', 'wake', 'Wake Cutter', spot(), look, { skill: 0.5, playerBias: 0.5, flares: i % 2 ? 2 : 0 }));
  for (let i = 0; i < fangs; i++) out.push(g.jumpIn('fang', 'wake', 'Wake Fang', spot(), look, { skill: 0.6, playerBias: 0.55, flares: 2 }));
  for (let i = 0; i < drones; i++) out.push(g.jumpIn('drone', 'wake', 'Wake drone', spot(), look, { skill: 0.45, playerBias: 0.4 }));
  return out;
}

// =============================================================================================

/**
 * 2. "Credentials". Combine: bring three relief transports to the Sovereign Dawn at Kestrel;
 * Drift salvagers come sniffing at them. Drift: bring three ore haulers through the Ashfall to the
 * Long Patience; Combine customs cutters want to inspect them. Either way you wave the inspectors
 * off by flying in their faces (shooting them is a diplomatic incident), and either way the cargo
 * is not what the manifest says. Then the Wake come for it.
 */
export async function runCredentials(g: Game, side: Side): Promise<void> {
  const player = g.player as Ship;
  g.friendlyFireLimit = 260;
  const combine = side === 'combine';
  let route: THREE.Vector3[];
  let start: THREE.Vector3;
  if (combine) {
    const dawn = g.points['carrier.hangarPort'];
    route = [v(-1700, 260, 1500), v(-900, 220, 900), v(-200, 200, 500), dawn.clone().add(v(-260, 60, 300)), dawn.clone()];
    start = v(-2300, 300, 1900);
  } else {
    g.spawnCapital('battlecruiser', 'drift', 'patience', 'Long Patience', v(150, 260, -4300), v(150, 260, -3800), { armed: false });
    route = [v(900, 400, 1400), v(700, 450, 0), v(450, 480, -1500), v(200, 420, -3100), v(150, 300, -3700)];
    start = v(1100, 380, 2200);
  }
  const names = combine ? ['Relief transport Amity', 'Relief transport Concord', 'Relief transport Mercy'] : ['Ore hauler Old Mule', 'Ore hauler Dogged', 'Ore hauler Tallow'];
  const convoy: Ship[] = [];
  const pilots: RoutePilot[] = [];
  names.forEach((name, i) => {
    const off = v(i * 80 - 80, (i % 2) * 30, i * 90);
    const s = g.spawnShip(TRANSPORT, side, name, start.clone().add(off), route[0].clone().add(off), { speed: 20, damageScale: 0.6 });
    const rp = new RoutePilot(
      route.map((p) => p.clone().add(off)),
      0.7,
      120,
    );
    s.ai = rp;
    convoy.push(s);
    pilots.push(rp);
  });
  g.followArena(convoy[0]);
  player.placeAt(start.clone().add(v(160, 80, -120)), route[0], 40);
  g.setMusicIntensity(0.25);
  g.objective = 'Escort the convoy';
  if (combine) {
    await g.say('vale', 'Rook, Lieutenant Vale. The Commander likes to see how new contractors fly before she trusts them with anything sharp. Three relief transports for the Dawn: food, medicine, water reclamation for Kestrel. Easy work.');
    await g.say('vale', 'If anyone asks to look inside, they do not. Politely.');
  } else {
    await g.say('kit', 'Rook! Kit. Mother Sorrel wants you on the ore run today, three haulers to the Long Patience. It is how we feed ourselves, so do not lose any.');
    await g.say('magpie', 'Magpie on Old Mule. The Combine have customs cutters in the Ashfall this week. If they want a look in my hold, they do not get one.');
  }
  await g.until(() => pilots[0].progress >= 0.35);

  // --- the inspectors ----------------------------------------------------------------------------
  const inspSide = other(side);
  const inspectors = [0, 1].map((i) => {
    const s = g.jumpIn(combine ? 'gannet' : 'sabre', inspSide, combine ? 'Drift salvager' : 'Combine customs', convoy[i].pos.clone().add(v(i ? 500 : -500, 120, -400)), convoy[i].pos, { skill: 0.5, playerBias: 0 });
    s.ai = new Shadow(convoy[i], v(i ? 60 : -60, 30, 0));
    return s;
  });
  if (combine) {
    await g.say('kit', 'Combine convoy, Drift salvage crew Lark. Funny-looking relief run. Mind if we take a peek? Just curious.');
    await g.say('vale', 'Rook. Get in their faces and they will think better of it. Do not fire on them. We are not at war with the Drift. Yet.');
  } else {
    await g.say('meridian', 'Drift haulers, Helion customs. Heave to for inspection.');
    await g.say('magpie', 'Rook, get between them and my hold. Fly right at them; they hate that. Do not shoot, or this turns into a war we are not ready for.');
  }
  g.hint('Fly close to an inspector and stay on it to wave it off. Firing on them counts against you', 8);
  const shoo = [0, 0];
  const looking = [0, 0];
  const gone = [false, false];
  const tick = ticker(g);
  const inspStart = g.missionTime;
  let inspected = false;
  let fired = false;
  g.onBetrayal = () => {
    fired = true;
  };
  await g.until(() => {
    const dt = tick();
    inspectors.forEach((s, i) => {
      if (!s.alive || gone[i]) return;
      if (s.pos.distanceTo(player.pos) < 170) shoo[i] += dt;
      const target = convoy[i];
      if (target.alive && s.pos.distanceTo(target.pos) < 140) looking[i] += dt;
      if (shoo[i] > 3) {
        gone[i] = true;
        g.retreat([s]);
      }
      if (looking[i] > 10) inspected = true;
    });
    // given long enough, they get their look one way or another
    if (g.missionTime - inspStart > 50) inspected = true;
    g.objective = `Wave off the inspectors · ${inspectors.filter((s, i) => s.alive && !gone[i]).length} left`;
    return inspectors.every((s, i) => !s.alive || gone[i]) || fired || inspected;
  });
  g.retreat(inspectors.filter((s, i) => s.alive && !gone[i]));
  if (inspected) {
    g.missionFlags.credentials = 'seen';
    if (combine) {
      await g.say('kit', 'Huh. Forty bunks in a water reclamation unit. That is a lot of thirsty water. Lark out.');
      await g.say('vale', 'They got a look. That will be in a report somewhere. Never mind, Rook.');
    } else {
      await g.say('meridian', 'Customs here. That is not ore, Drift. We will be talking about this.');
      await g.say('magpie', 'It is ore. Very excitable ore. Never mind, Rook.');
    }
  } else if (fired) {
    g.missionFlags.credentials = 'fired';
    await g.say(combine ? 'vale' : 'kit', combine ? 'Rook! I said do not fire. That will cost the Commander a very polite apology.' : 'Rook! Sorrel is going to hear about that. Let us just get home.');
  } else {
    g.missionFlags.credentials = 'clean';
    if (combine) {
      await g.say('kit', 'Fine, fine, we are going. Funny, though. Your relief ships run with troop transponders. Lark out.');
      await g.say('vale', 'Transponder glitch. Do not worry about it, Rook.');
    } else {
      await g.say('meridian', 'Very well, Drift. Customs will remember your escort. And your hold.');
      await g.say('kit', 'Magpie, why are your haulers riding so heavy if it is just ore?');
      await g.say('magpie', 'Good rocks, Kit. Very dense rocks.');
    }
  }

  // --- the Wake want it too ---------------------------------------------------------------------
  g.setMusicIntensity(0.8);
  const raid = wakeRaid(g, convoy[0].pos.clone().add(v(400, 150, -700)), convoy[0].pos, 4, 1, 4);
  await g.say('vey', 'A juicy little convoy. Wake, take whatever is in those holds.');
  await g.until(() => {
    g.objective = `Drive off the Wake · ${alive(raid)} left · ${alive(convoy)} of 3 ships`;
    return alive(raid) === 0 || alive(convoy) === 0;
  });
  g.retreat(raid);
  g.setMusicIntensity(0.3);
  await g.until(() => alive(convoy) === 0 || convoy.every((s, i) => !s.alive || pilots[i].done));
  const arrived = convoy.filter((s) => s.alive).length;
  g.objective = '';
  if (arrived < 1) {
    await g.say(combine ? 'vale' : 'kit', combine ? 'We lost the lot. The Commander will not be pleased.' : 'We lost the lot. Mother Sorrel will not be pleased.');
    g.endMission('defeat', 'Every ship in the convoy was lost.');
    return;
  }
  g.bonusPay = arrived * 2000;
  if (combine) await g.say('tessaine', 'Tessaine. The transports are aboard, Rook. You fly well and you do as you are told. I have use for both.');
  else await g.say('sorrel', 'Sorrel. The haulers are home. Thank you, Rook. You have earned a seat at our table.');
  await g.wait(1);
  g.endMission('victory');
}

// =============================================================================================

/**
 * 4. "Loose Ends" in the Ashfall. A Wake courier got out of the Gallows with the second copy of
 * the transfer records and is running for a Drift frigate. Combine: kill it before it gets there
 * (Vale asks why it cannot be taken alive). Drift: get it there alive (Kit asks why we are
 * protecting the people who raided Kestrel).
 */
export async function runLooseEnds(g: Game, side: Side): Promise<void> {
  const player = g.player as Ship;
  const combine = side === 'combine';
  // the Drift protect the courier either way; you are on one side of that or the other
  g.setRelation('combine', 'drift', true);
  g.setRelation('wake', 'drift', false);
  g.setRelation('wake', 'player', combine);
  g.setRelation('drift', 'player', combine);
  g.setRelation('combine', 'player', !combine);
  g.friendlyFireLimit = 400;
  const pickup = g.spawnCapital('frigate', 'drift', 'lark', 'Drift frigate Lark', v(-900, 650, -3200), v(-900, 650, -2500), { armed: true, skill: 0.4 });
  const route = [v(900, 520, 1300), v(600, 600, 200), v(100, 650, -900), v(-500, 660, -2200), pickup.root.position.clone().add(v(0, 0, 200))];
  const courier = g.spawnShip({ ...SHIP_CLASSES.shuttle, civilian: false, targetable: true, hull: 900, shields: 500, maxSpeed: 70, boostSpeed: 70, bounty: 3000 }, 'wake', 'Wake courier Corvid', v(1300, 500, 2000), route[0], { speed: 50 });
  const rp = new RoutePilot(route, 0.75, 150);
  courier.ai = rp;
  if (!combine) courier.damageScale = 0.3;
  g.followArena(courier, 3200, 4200);
  const guards = [0, 1, 2].map((i) => g.spawnShip(i === 2 ? 'fang' : 'raider', 'wake', 'Corvid escort', courier.pos.clone().add(v(i * 50 - 50, 30, 60)), route[0], { skill: 0.55, playerBias: combine ? 0.6 : 0 }));
  const friends = combine
    ? [0, 1].map((i) => g.spawnShip('sabre', 'combine', i ? 'Lance 2' : 'Lt. Vale', v(1700 + i * 60, 560, 2500), route[0], { skill: 0.6, playerBias: 0, damageScale: 0.6 }))
    : [g.spawnShip('gannet', 'drift', 'Kit', v(1500, 560, 2400), route[0], { skill: 0.6, playerBias: 0, damageScale: 0.6 })];
  void friends;
  player.placeAt(v(1650, 600, 2600), courier.pos, 70);
  g.setMusicIntensity(0.6);
  g.objective = combine ? 'Destroy the Wake courier Corvid' : 'Get the courier Corvid to the Drift frigate';
  if (combine) {
    await g.say('tessaine', 'Rook. One Wake ship got out of the Gallows with a copy of what Vey was shouting about. It is running for a Drift frigate. It does not get there.');
    await g.say('vale', 'Commander, a courier taken alive could tell us who else has copies.');
    await g.say('tessaine', 'Dead, Lieutenant. Rook, dead.');
  } else {
    await g.say('sorrel', 'Rook. Vey kept a second copy of the records, and he is sending it to us. His courier is running for our frigate Lark with the Combine behind it. Keep it alive.');
    await g.say('kit', 'We are protecting the Wake now? The people who hit Kestrel?');
    await g.say('sorrel', 'We are protecting the truth, Kit. It does not get to choose its messengers.');
  }
  // the hunters (or your rivals) arrive in waves along the way
  let wave = 0;
  const hunters: Ship[] = [];
  let lastWave = g.missionTime;
  await g.until(() => {
    const p = rp.progress;
    if (!combine && wave < 3 && (p >= 0.2 * (wave + 1) || g.missionTime - lastWave > 35)) {
      wave++;
      lastWave = g.missionTime;
      hunters.push(...jumpWing(g, 'combine', wing('combine', wave === 3 ? 4 : 3, wave >= 2), 'Combine hunter', courier.pos.clone().add(v(-400, 120, -500)), courier.pos, { playerBias: 0.4 }));
      // one of each wave goes for the courier; the rest want the escorts out of the way first
      const fresh = hunters.slice(-(wave === 3 ? 4 : 3));
      if (fresh[0]?.ai instanceof AIPilot) fresh[0].ai.forcedTarget = courier;
      if (wave === 1) void g.say('meridian', 'Hunter flights, the courier is in the debris. Kill it.').catch(() => undefined);
    }
    if (combine && wave < 1 && p >= 0.4) {
      wave++;
      hunters.push(...jumpWing(g, 'drift', ['gannet', 'gannet', 'bulwark'], 'Drift escort', courier.pos.clone().add(v(0, 100, -700)), player.pos, { playerBias: 0.6 }));
      void g.say('kit', 'Combine fighters on the courier! Drift escorts, cover it!').catch(() => undefined);
    }
    const hp = Math.round(frac(courier) * 100);
    g.objective = combine ? `Destroy the courier Corvid · ${courier.alive ? `${hp}%` : 'down'}` : `Get Corvid to the Lark · courier ${courier.alive ? `${hp}%` : 'lost'}`;
    return !courier.alive || rp.done;
  });
  const killed = !courier.alive;
  g.retreat([...guards, ...hunters].filter((s) => s.alive));
  g.objective = '';
  g.setMusicIntensity(0.3);
  if (combine) {
    if (!killed) {
      await g.say('tessaine', 'It reached the frigate. Rook, I asked for one thing.');
      g.endMission('defeat', 'The Wake courier reached the Drift frigate.');
      return;
    }
    await g.say('vale', 'Courier is down. No survivors. Which I suppose was the point.');
    await g.say('vey', 'Open band. Nice shooting, Combine. Too late. I sent the copies an hour ago.');
    await g.say('tessaine', 'Then we will be waiting wherever they surface. Good work, Rook. Come home.');
    g.missionFlags.courier = 'killed';
  } else {
    if (killed) {
      await g.say('sorrel', 'We lost it. Rook, everything Vey had died with that ship.');
      g.endMission('defeat', 'The Wake courier was destroyed before it reached the Lark.');
      return;
    }
    if (courier.alive) g.jumpOut(courier);
    await g.say('vey', 'Corvid is aboard your frigate, Drift. The records are yours. Spend them well, old woman.');
    await g.say('sorrel', 'Thank you, Rook. Now the whole Reach can know what was done at Kestrel.');
    g.missionFlags.courier = 'delivered';
  }
  await g.wait(1);
  g.endMission('victory');
}

// =============================================================================================

/**
 * 6. "Sealed Orders". The other side raids your home: Combine, the Drift hit Bastion's drydock;
 * Drift, the Combine hit Haven's water tugs. Hold them off, and afterwards you are told the plan
 * for the Accord. You are trusted now, and you are the one who will make it work.
 */
export async function runSealedOrders(g: Game, side: Side, c: Campaign): Promise<void> {
  const player = g.player as Ship;
  const combine = side === 'combine';
  const enemy = other(side);
  g.setRelation('combine', 'drift', true);
  g.setRelation(enemy, 'player', true);
  g.friendlyFireLimit = 400;
  const P = (k: string) => g.points[`${combine ? 'bastion' : 'haven'}.${k}`];
  // what the raid is after
  const assets: Ship[] = [];
  if (combine) {
    const dock = P('drydock');
    for (let i = 0; i < 3; i++) {
      const s = g.spawnShip({ ...SHIP_CLASSES.relay, id: 'gantry', name: 'Drydock gantry', hull: 2600, shields: 700, bounty: 0 }, 'combine', 'Drydock gantry', dock.clone().add(v(i * 120 - 120, 60, 0)), dock, { damageScale: 0.6 });
      assets.push(s);
    }
  } else {
    const route = [v(-200, -120, 900), v(-700, -180, -200), v(-400, -200, -1400), P('evac')];
    for (let i = 0; i < 3; i++) {
      const off = v(i * 90 - 90, i * 20, i * 110);
      const s = g.spawnShip({ ...TRANSPORT, name: 'Water tug', hull: 4000, shields: 900 }, 'drift', ['Water tug Brine', 'Water tug Cistern', 'Water tug Rill'][i], v(300, -80, 1600).add(off), route[0].clone().add(off), { speed: 20, damageScale: 0.6 });
      s.ai = new RoutePilot(
        route.map((p) => p.clone().add(off)),
        0.5,
        120,
      );
      assets.push(s);
    }
  }
  const home = combine ? P('drydock') : v(-300, -150, 300);
  player.placeAt(home.clone().add(v(300, 200, 900)), home, 60);
  const allies = combine
    ? [0, 1].map((i) => g.spawnShip('sabre', 'combine', i ? 'Lance 3' : 'Lt. Vale', home.clone().add(v(-200 + i * 60, 220, 800)), home, { skill: 0.6, playerBias: 0, damageScale: 0.6 }))
    : [0, 1].map((i) => g.spawnShip('gannet', 'drift', i ? 'Drift escort' : 'Kit', home.clone().add(v(-200 + i * 60, 220, 800)), home, { skill: 0.6, playerBias: 0, damageScale: 0.6 }));
  void allies;
  g.setMusicIntensity(0.3);
  g.objective = combine ? 'Report to Bastion' : 'Report to Haven';
  if (combine) await g.say('tessaine', 'Rook, Bastion. I have sealed orders for you, and they are not for the radio. Land at the drydock when you are ready.');
  else await g.say('sorrel', 'Rook, come to Haven. There is something I need to tell you in person.');
  await g.wait(4);

  // --- the raid ---------------------------------------------------------------------------------
  g.setMusicIntensity(0.9);
  const raiders: Ship[] = [];
  const waves = [4, 5, 6];
  for (let w = 0; w < waves.length; w++) {
    const at = home.clone().add(v(Math.cos(w * 2.2) * 1200, 200 + w * 60, Math.sin(w * 2.2) * 1200 - 400));
    const ships = jumpWing(g, enemy, wing(enemy, waves[w], w > 0), enemy === 'drift' ? 'Drift raider' : 'Combine raider', at, home, { playerBias: 0.35 });
    for (const [i, s] of ships.entries()) if (s.ai instanceof AIPilot && i % 3 === 0) s.ai.forcedTarget = assets[i % assets.length];
    if (w === 2) {
      // the raid's heavy: a frigate standing off and shelling
      const f = g.spawnCapital('frigate', enemy, 'raidfrigate', enemy === 'drift' ? 'Drift frigate Scold' : 'Combine frigate Verity', at.clone().add(v(0, 100, -300)), home, { armed: true, skill: 0.45 });
      f.goal = home.clone().add(v(0, 300, 900));
      f.speed = 25;
    }
    raiders.push(...ships);
    if (w === 0) {
      if (combine) await g.say('quell', 'Bastion control! Drift fighters inbound on the drydock! All wings, scramble!');
      else await g.say('kit', 'Combine fighters coming in on the water tugs! They are going for the water!');
    }
    if (w === 2) await g.say(combine ? 'vale' : 'kit', combine ? 'Frigate jumping in! Keep them off the gantries!' : 'A frigate! They brought a frigate to shoot water tugs!');
    // a wave that has lost most of its ships, or been at it long enough, breaks off
    const waveStart = g.missionTime;
    const near = () => ships.filter((s) => s.alive && s.pos.distanceTo(home) < 3000).length;
    await g.until(() => {
      g.objective = `Hold off the raid · wave ${w + 1} of 3 · ${near()} left · ${alive(assets)} of 3 ${combine ? 'gantries' : 'tugs'}`;
      return near() === 0 || (near() <= 1 && g.missionTime - waveStart > 60) || g.missionTime - waveStart > 120 || alive(assets) === 0;
    });
    if (alive(assets) === 0) break;
    g.retreat(ships);
    await g.wait(3);
  }
  g.objective = '';
  for (const cap of [...g.capitals]) if (cap.id === 'raidfrigate') g.armCapital(cap, false);
  g.retreat(raiders.filter((s) => s.alive));
  const saved = alive(assets);
  if (!saved) {
    await g.say(combine ? 'tessaine' : 'sorrel', 'All of them. We lost all of them.');
    g.endMission('defeat', combine ? 'All three drydock gantries were destroyed.' : 'All three water tugs were destroyed.');
    return;
  }
  g.bonusPay = saved * 2500;
  g.setMusicIntensity(0.3);
  // --- the plan ---------------------------------------------------------------------------------
  if (combine) {
    await g.say('tessaine', 'They are getting bolder. Good. It makes this easier to explain. Rook, the Accord at Kestrel is not a peace. It is a key.');
    await g.say('tessaine', 'The delegation shuttles will carry marines. When the ink is dry, Kestrel will be under Combine protection, its yards will be ours, and the Drift will have nowhere left to trade.');
    await g.say('vale', 'And the Wake raid at Kestrel, Commander? The one that made them need protecting?');
    await g.say('tessaine', 'Was paid for, Lieutenant. You will keep that to yourself. Rook, Kestrel\'s defence relays must be blind when the shuttles arrive. You will see to it.');
  } else {
    await g.say('sorrel', 'This is what they are, Rook. They shoot at water. So here is what we are going to do.');
    await g.say('sorrel', 'At the Accord, the Magpie will fly a gift into the Sovereign Dawn\'s hangar. Three hundred tonnes of mining charge. Without the Dawn, Bastion stands alone, and Bastion can be broken.');
    await g.say('kit', 'There are dock crews in that hangar, Mother.');
    await g.say('sorrel', 'There are, Kit. I have counted them every night. Rook, we need the Dawn\'s hangar clearance codes, and you are the only one of us they let near her.');
  }
  g.missionFlags.plan = 'told';
  void c;
  await g.wait(1);
  g.endMission('victory');
}

// =============================================================================================

/**
 * 7. "Keys to the Door" at Kestrel, by night. A quiet job: fly up to three points, sit still beside
 * each long enough to plant a tap, and do not let the patrols notice you. Combine: Kestrel's
 * defence relays. Drift: the Sovereign Dawn's comms masts. Same signature meter as Flotsam.
 */
export async function runKeys(g: Game, side: Side, checkpoint: number): Promise<void> {
  const player = g.player as Ship;
  const combine = side === 'combine';
  const frame = g.location.frames.carrier;
  const targets = combine
    ? [v(560, 180, -360), v(-520, -140, -480), v(-240, 280, 640)]
    : [v(0, 30, -420), v(46, 110, 336), v(-38, 175, 312)].map((p) => p.applyMatrix4(frame));
  const labels = combine ? ['RELAY NORTH', 'RELAY EAST', 'RELAY WEST'] : ['BOW ARRAY', 'SENSOR RING', 'COMMAND MAST'];
  // the relays are real things you can see
  if (combine) for (const [i, p] of targets.entries()) g.spawnShip('relay', 'kestrel', `Defence relay ${i + 1}`, p.clone(), p.clone().add(v(0, 0, -100)), {});
  // patrols that circle each point
  const patrols: Ship[] = [];
  for (const [i, p] of targets.entries()) {
    const ring: THREE.Vector3[] = [];
    const r = 260 + i * 40;
    for (let k = 0; k < 8; k++) ring.push(p.clone().add(v(Math.cos((k / 8) * Math.PI * 2) * r, (k % 2) * 40 - 20, Math.sin((k / 8) * Math.PI * 2) * r)));
    const s = g.spawnShip(combine ? (i === 1 ? 'bulldog' : 'wren') : 'sabre', combine ? 'kestrel' : 'combine', combine ? 'Militia patrol' : 'Dawn picket', ring[0].clone(), ring[1], { speed: 50 });
    s.ai = new RoutePilot([...ring, ...ring, ...ring, ...ring, ...ring, ...ring], 0.45, 40);
    patrols.push(s);
  }
  const startAt = v(1500, 600, 1500);
  player.placeAt(startAt, targets[Math.min(checkpoint, 2)], 30);
  g.setMusicIntensity(0.12);
  if (checkpoint === 0) {
    if (combine) {
      await g.say('vale', 'Rook. Three relays guard Kestrel\'s approach. Sit beside each one long enough for the tap to take, and in the morning they will see nothing coming.');
      await g.say('vale', 'Militia patrols fly loops round them. If they see you, there is no Accord tomorrow. Quietly.');
    } else {
      await g.say('magpie', 'Rook, Magpie. Three masts on the Sovereign Dawn: bow array, sensor ring, command mast. Sit by each one, and my little box will copy her hangar codes.');
      await g.say('magpie', 'Her pickets fly loops round all three. Slow and cold, like the Ashfall. Please.');
    }
  }
  // the signature meter: engines, boost, guns and getting close to a patrol all show
  let signature = 0;
  let spotted = false;
  g.signature = 0;
  g.onFrame((dt) => {
    if (g.signature === null || spotted) return;
    const c = player.controls;
    let heat = Math.max(0, c.throttle - 0.3) * 0.9 + (player.speed > 60 ? 0.3 : 0);
    if (player.boosting) heat += 1.6;
    if (c.fire) heat += 2;
    for (const s of patrols) {
      if (!s.alive) continue;
      const d = s.pos.distanceTo(player.pos);
      if (d < 260) heat += 0.5 * (1 - d / 260);
    }
    signature = Math.max(0, signature + (heat > 0.02 ? heat * 0.4 : -0.15) * dt);
    g.signature = Math.min(1, signature);
    if (signature >= 1) spotted = true;
  });
  g.hint('Throttle low and slow. Sit within 50 m of each marker to plant the tap. Patrols nearby, boosting and firing heat you up', 9);
  for (let i = Math.min(checkpoint, 2); i < targets.length; i++) {
    g.checkpoint = i;
    const t = targets[i];
    g.waypoints = [{ name: labels[i], pos: t, color: '#7dff9a' }];
    let planted = 0;
    const tick = ticker(g);
    await g.until(() => {
      const dt = tick();
      if (player.pos.distanceTo(t) < 50 && player.speed < 40) planted += dt;
      g.objective = `Plant the taps · ${i} of 3 done${planted > 0 ? ` · planting ${Math.min(100, Math.round((planted / 6) * 100))}%` : ''}`;
      return planted >= 6 || spotted;
    });
    if (spotted) break;
    g.audio.blip(1600, 0.1, 0.08);
    if (i < 2) void g.say(combine ? 'vale' : 'magpie', i === 0 ? 'First one is in. Two to go.' : 'Two. One more, Rook.').catch(() => undefined);
  }
  g.waypoints = [];
  g.signature = null;
  if (spotted) {
    if (combine) await g.say('juno', 'Unknown contact by the relays! Rook? What are you doing out here?');
    else await g.say('meridian', 'Contact by the Dawn\'s masts! Pickets, intercept!');
    g.hint('You were spotted. Try again: slow and cold', 6);
    await g.wait(2);
    g.endMission('defeat', combine ? 'Kestrel\'s militia spotted you by the relays. Fly slow and cold: low speed, no boost, no guns.' : 'The Dawn\'s pickets spotted you by her masts. Fly slow and cold: low speed, no boost, no guns.');
    return;
  }
  g.objective = '';
  if (combine) {
    await g.say('vale', 'All three taps are live. Tomorrow Kestrel\'s guns will be looking at empty sky. I hope you sleep better than I will, Rook.');
  } else {
    await g.say('magpie', 'Codes copied. The Dawn will open her hangar to a Drift hauler as if it were one of her own. Go home, Rook. Tomorrow is the Accord.');
  }
  g.missionFlags.keys = 'planted';
  await g.wait(1);
  g.endMission('victory');
}

// =============================================================================================

/**
 * 9. "Lantern". Before the finale the fleet has to know where to jump. Fly ahead, lay three jump
 * beacons close to the enemy's home under fire, and hold them until the fleet locks on. Combine:
 * at Haven, for the Sovereign Dawn and the Resolute. Drift: at Bastion, for the Long Patience.
 * It ends with the fleet coming out of the jump behind you.
 */
export async function runLantern(g: Game, side: Side, c: Campaign, checkpoint: number): Promise<void> {
  const player = g.player as Ship;
  const combine = side === 'combine';
  const enemy = other(side);
  g.setRelation('combine', 'drift', true);
  g.setRelation(enemy, 'player', true);
  if (!combine) g.setRelation('kestrel', 'combine', true);
  g.friendlyFireLimit = 400;
  const spots = [v(-800, 260, 1700), v(0, 420, 1450), v(800, 200, 1700)];
  player.placeAt(v(0, 300, 2900), v(0, 0, 0), 80);
  const allies = combine
    ? [0, 1].map((i) => g.spawnShip('sabre', 'combine', i ? 'Lance 2' : 'Lt. Vale', v(-100 + i * 60, 320, 3000), v(0, 0, 0), { skill: 0.6, playerBias: 0, damageScale: 0.6 }))
    : [g.spawnShip('gannet', 'drift', 'Kit', v(-100, 320, 3000), v(0, 0, 0), { skill: 0.6, playerBias: 0, damageScale: 0.6 })];
  if (!combine && c.flags.kestrel === 'free') allies.push(g.spawnShip('warden', 'kestrel', 'Juno', v(80, 300, 3050), v(0, 0, 0), { skill: 0.65, playerBias: 0, damageScale: 0.6 }));
  void allies;
  g.setMusicIntensity(0.5);
  const beacons: Ship[] = [];
  const BEACON: ShipClass = { ...SHIP_CLASSES.relay, id: 'beacon', name: 'Jump beacon', hull: 2400, shields: 800, shieldRegen: 30, radius: 10, bounty: 0 };
  if (checkpoint === 0) {
    if (combine) {
      await g.say('tessaine', 'Rook. Haven sits in a tangle of rock that a fleet cannot jump into blind. Lay three beacons on the approach and hold them until the Dawn and the Resolute lock on. Then it is over.');
      await g.say('vale', 'Lance flight with you. Last time we do this, Rook.');
    } else {
      await g.say('sorrel', 'Rook. The Long Patience cannot jump blind into Bastion\'s shadow. Lay three beacons on the approach and hold them until we lock on. Then we finish this.');
      await g.say('kit', 'Right behind you. Let us light the way.');
    }
  }
  const wave = (n: number, heavy: boolean): Ship[] => {
    const at = v((Math.random() - 0.5) * 1200, 200 + Math.random() * 200, 600);
    return jumpWing(g, enemy, wing(enemy, n, heavy), enemy === 'combine' ? 'Bastion defender' : 'Haven defender', at, player.pos, { playerBias: 0.5 });
  };
  const defenders: Ship[] = [];
  for (let i = 0; i < spots.length; i++) {
    g.waypoints = [{ name: `BEACON ${i + 1}`, pos: spots[i], color: '#ffd36b' }];
    let held = 0;
    if (i > 0) defenders.push(...wave(3 + i, i === 2));
    const tick = ticker(g);
    await g.until(() => {
      const dt = tick();
      if (player.pos.distanceTo(spots[i]) < 60) held += dt;
      g.objective = `Lay the jump beacons · ${i} of 3 · ${held > 0 ? `deploying ${Math.min(100, Math.round((held / 4) * 100))}%` : 'fly to the marker'}`;
      return held >= 4;
    });
    const b = g.spawnShip(BEACON, side, `Jump beacon ${i + 1}`, spots[i].clone(), v(0, 0, 0), { damageScale: 0.5 });
    beacons.push(b);
    g.audio.blip(1400, 0.12, 0.08);
    if (i === 0) void g.say(enemy === 'combine' ? 'tessaine' : 'sorrel', enemy === 'combine' ? 'Beacon on the approach to Bastion! Destroy it!' : 'Beacon on the Haven approach! Kill it, all of you!').catch(() => undefined);
  }
  g.waypoints = [];
  g.checkpoint = 1;
  // hold them while the fleet locks on
  const lockTime = 60;
  const lockStart = g.missionTime;
  let nextWave = g.missionTime + 5;
  let gunship: Ship | null = null;
  await g.until(() => {
    if (g.missionTime > nextWave) {
      nextWave = g.missionTime + 25;
      const ws = wave(3, true);
      for (const [k, s] of ws.entries()) if (s.ai instanceof AIPilot && k % 3 === 0) s.ai.forcedTarget = beacons[k % beacons.length];
      defenders.push(...ws);
    }
    if (!gunship && g.missionTime - lockStart > 30) {
      gunship = g.jumpIn(enemy === 'combine' ? 'sunspear' : 'ironbark', enemy, enemy === 'combine' ? 'Sunspear' : 'Ironbark', v(0, 300, 700), beacons[1].pos, { skill: 0.6, playerBias: 0.4, flares: 3 });
      defenders.push(gunship);
      void g.say(combine ? 'vale' : 'kit', 'Gunship! It is going for the beacons!').catch(() => undefined);
    }
    const left = Math.max(0, Math.ceil(lockTime - (g.missionTime - lockStart)));
    g.objective = `Hold the beacons · fleet lock in ${left} s · ${alive(beacons)} of 3 beacons`;
    return left <= 0 || alive(beacons) === 0;
  });
  if (alive(beacons) === 0) {
    await g.say(combine ? 'tessaine' : 'sorrel', 'The beacons are gone. We cannot jump. Rook, fall back.');
    g.endMission('defeat', 'All three jump beacons were destroyed, so the fleet could not jump.');
    return;
  }
  // the fleet comes out of the jump behind you
  g.setMusicIntensity(1);
  if (combine) {
    const dawn = g.spawnCapital('battlecruiser', 'combine', 'dawn', 'Sovereign Dawn', v(-300, 500, 3400), v(0, 0, 0), { armed: true, skill: 0.5 });
    const resolute = g.spawnCapital('destroyer', 'combine', 'resolute', 'Resolute', v(600, 380, 3000), v(0, 0, 0), { armed: true, skill: 0.5 });
    g.fx.jumpIn(dawn.root.position, v(0, 0, -1), '#8fd8ff');
    g.fx.jumpIn(resolute.root.position, v(0, 0, -1), '#8fd8ff');
    g.audio.jumpIn(dawn.root.position);
    launchFrom(g, dawn, ['sabre', 'sabre', 'halberd', 'sabre'], 'combine', 'Dawn Sabre', { skill: 0.6, playerBias: 0, tactic: 'standoff' });
    await g.say('quell', 'Sovereign Dawn and Resolute, out of the jump. Beacons are good. All wings, launch.');
    await g.say('tessaine', 'Well done, Rook. Haven is in front of us. Tomorrow we finish it.');
  } else {
    const patience = g.spawnCapital('battlecruiser', 'drift', 'patience', 'Long Patience', v(-300, 500, 3400), v(0, 0, 0), { armed: true, skill: 0.5 });
    g.fx.jumpIn(patience.root.position, v(0, 0, -1), '#ffb36a');
    g.audio.jumpIn(patience.root.position);
    launchFrom(g, patience, ['gannet', 'gannet', 'bulwark', 'gannet'], 'drift', 'Drift escort', { skill: 0.6, playerBias: 0, tactic: 'flanker' });
    await g.say('magpie', 'Long Patience, out of the jump. Beacons are good. Every gun we have is looking at Bastion.');
    await g.say('sorrel', 'Well done, Rook. Bastion is in front of us. Tomorrow we finish it.');
  }
  g.retreat(defenders.filter((s) => s.alive));
  g.missionFlags.lantern = 'lit';
  g.objective = '';
  await g.wait(3);
  g.endMission('victory');
}
