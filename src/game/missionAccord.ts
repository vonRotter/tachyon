import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { AIPilot, RoutePilot } from '../entities/ai';
import { SHIP_CLASSES, type ShipClass } from '../entities/shipClasses';
import type { CapitalShip } from '../entities/capitalShip';
import type { FactionId } from '../entities/factions';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
/** Ships still in the fight: anything that has run more than 3 km from Kestrel counts as gone. */
const alive = (ships: Ship[]): number => ships.filter((s) => s.alive && s.pos.length() < 3000).length;
/** Sends home whoever ran from the fight. */
const sweep = (g: Game, ships: Ship[]): void => {
  g.retreat(ships);
};

/** The convoy craft: escortable, and shootable by everyone (unlike traffic). */
const DELEGATION: ShipClass = { ...SHIP_CLASSES.shuttle, civilian: false, hull: 700, shields: 300, maxSpeed: 60, name: 'Delegation shuttle' };
const TITHE: ShipClass = { ...SHIP_CLASSES.freighter, civilian: false, hull: 1800, shields: 600, shieldRegen: 12, shieldDelay: 4, name: 'Hauler Tithe' };

/**
 * "The Accord" (both paths). The Combine and the Drift come to Kestrel to sign a ceasefire, and
 * each brings something it should not. On the Combine side the delegation shuttles are full of
 * marines; on the Drift side the "gift" hauler is full of mining charge. You find out halfway
 * through, with the convoy in your care: see it through and stay, or turn on your own side.
 *
 * Checkpoints: 0 the escort, 1 the reveal and the choice, 2 after turning.
 */
export async function runAccord(g: Game, checkpoint: number, side: 'combine' | 'drift'): Promise<void> {
  const pad = () => g.input.device === 'gamepad';
  const key = (a: Parameters<typeof g.input.label>[0]) => g.input.label(a);
  const player = g.player as Ship;
  const frame = g.location.frames.carrier;
  const dawn = (x: number, y: number, z: number) => v(x, y, z).applyMatrix4(frame);
  const dawnOut = v(1, 0, 0).transformDirection(frame);
  const hub = g.points['station.hub'];
  const bay = g.location.docks.find((d) => d.id === 'kestrel.bay1');
  const bayPad = bay ? bay.pad.clone() : g.points['station.bay'].clone();
  const bayOut = bay ? bay.outward.clone() : v(1, 0, 0);

  g.friendlyFireLimit = 160;
  g.setRelation('kestrel', 'combine', false);
  g.setRelation('kestrel', 'drift', false);
  g.setRelation('combine', 'drift', false);

  // the Long Patience: parked off the station on the Drift side, arrives late on the Combine side
  let patience: CapitalShip | null = null;
  const bringPatience = (jump: boolean) => {
    const pos = v(-1700, 320, 1250);
    patience = g.spawnCapital('battlecruiser', 'drift', 'patience', 'Long Patience', pos, hub, { armed: false });
    if (jump) {
      g.fx.jumpIn(pos, v(1, 0, -0.6).normalize(), '#ffb36a');
      g.audio.jumpIn(pos);
    }
    return patience;
  };
  if (side === 'drift' || checkpoint === 2) bringPatience(false);

  // Kestrel's station defence: two Wardens you know and a flight of Wrens
  const militia: Ship[] = [
    g.spawnShip('warden', 'kestrel', 'Juno', hub.clone().add(v(-160, 120, 300)), hub, { skill: 0.65, playerBias: 0.3, damageScale: 0.6 }),
    g.spawnShip('warden', 'kestrel', 'Pike', hub.clone().add(v(-220, 80, 340)), hub, { skill: 0.6, playerBias: 0.3, damageScale: 0.6 }),
  ];
  for (let i = 0; i < 4; i++) militia.push(g.spawnShip('wren', 'kestrel', `Wren ${i + 1}`, hub.clone().add(v(200 - i * 60, -120, 260)), hub, { skill: 0.5, playerBias: 0.3, damageScale: 0.6 }));

  /** Sabres off the Dawn's hangar deck. */
  const launchSabres = (n: number, name: string, opts: { skill: number; playerBias: number; tactic?: 'standoff' | 'flanker' | 'swarm' }): Ship[] => {
    const out: Ship[] = [];
    for (let i = 0; i < n; i++) {
      const p = dawn(100, -20, [-95, -75, -55][i % 3] + Math.floor(i / 3) * 6);
      const s = g.spawnShip('sabre', 'combine', name, p, p.clone().add(dawnOut), { ...opts, speed: 0 });
      g.catapult(s);
      out.push(s);
    }
    return out;
  };

  /** A Wake raid with a drone cloud: Vey does not want an Accord either. */
  const wakeRaid = (center: THREE.Vector3): Ship[] => {
    const out: Ship[] = [];
    for (let i = 0; i < 4; i++) out.push(g.jumpIn('raider', 'wake', 'Wake Cutter', center.clone().add(v(i * 50 - 75, (i % 2) * 30, i * 20)), hub, { skill: 0.5, playerBias: 0.5, flares: i < 2 ? 2 : 0 }));
    for (let i = 0; i < 8; i++) out.push(g.jumpIn('drone', 'wake', 'Wake drone', center.clone().add(v((i % 4) * 30 - 45, 60 + Math.floor(i / 4) * 30, -40)), hub, { skill: 0.4, playerBias: 0.4 }));
    return out;
  };

  // --- the convoy -------------------------------------------------------------------------------
  let convoy: Ship[] = [];
  let pilots: RoutePilot[] = [];
  let convoyFaction: FactionId;
  /** Where the convoy is going, for the objective and the "it arrived" check. */
  let destination: THREE.Vector3;
  if (side === 'combine') {
    convoyFaction = 'combine';
    destination = bayPad.clone().addScaledVector(bayOut, 40);
    const route = [dawn(420, 40, -75), dawn(300, 140, 560), v(500, 260, 420), bayPad.clone().addScaledVector(bayOut, 320), bayPad.clone().addScaledVector(bayOut, 120), destination];
    const startAt = checkpoint >= 1 ? 3 : 0;
    for (let i = 0; i < 3; i++) {
      const p = (checkpoint >= 1 ? v(500, 260, 420) : dawn(180, 0, -75)).add(v(0, i * 24 - 24, i * 30));
      const s = g.spawnShip(DELEGATION, 'combine', `Delegation ${i + 1}`, p, route[startAt], { speed: 0 });
      const rp = new RoutePilot(route.slice(startAt).map((q) => q.clone().add(v(0, i * 20 - 20, i * 25))), 0.55, 70);
      s.ai = rp;
      convoy.push(s);
      pilots.push(rp);
    }
  } else {
    convoyFaction = 'drift';
    destination = dawn(130, 0, -75);
    const route = [v(-900, 320, 950), v(500, 300, 800), dawn(250, 120, 520), dawn(600, 60, 200), dawn(600, 20, -75), destination];
    const startAt = checkpoint >= 1 ? 1 : 0;
    const p = checkpoint >= 1 ? v(-300, 310, 880) : v(-1500, 300, 1150);
    const s = g.spawnShip(TITHE, 'drift', 'Hauler Tithe', p, route[startAt], { speed: 0 });
    const rp = new RoutePilot(route.slice(startAt), 0.75, 90);
    s.ai = rp;
    convoy = [s];
    pilots = [rp];
  }
  const progress = () => pilots.reduce((m, p) => Math.max(m, p.progress), 0);
  const holdConvoy = (hold: boolean) => pilots.forEach((p) => (p.hold = hold));
  const arrived = () => convoy.some((s, i) => s.alive && pilots[i].done);

  // the player flies alongside
  const escortStart = side === 'combine' ? dawn(260, 60, 60) : v(-1300, 360, 1180);
  if (checkpoint <= 1) player.placeAt(checkpoint === 0 ? escortStart : convoy[0].pos.clone().add(v(80, 40, 120)), convoy[0].pos.clone().add(v(0, 0, -400)), 60);
  const wing: Ship[] = [];
  if (side === 'combine') {
    wing.push(g.spawnShip('sabre', 'combine', 'Lt. Vale', escortStart.clone().add(v(-60, 20, 40)), hub, { skill: 0.65, playerBias: 0, damageScale: 0.6 }));
    wing.push(g.spawnShip('sabre', 'combine', 'Lance 2', escortStart.clone().add(v(-100, -10, 70)), hub, { skill: 0.55, playerBias: 0, damageScale: 0.6 }));
  } else {
    wing.push(g.spawnShip('gannet', 'drift', 'Kit', escortStart.clone().add(v(-60, 20, 40)), hub, { skill: 0.65, playerBias: 0, damageScale: 0.6 }));
    wing.push(g.spawnShip('gannet', 'drift', 'Drift escort', escortStart.clone().add(v(-100, -10, 70)), hub, { skill: 0.55, playerBias: 0, damageScale: 0.6 }));
  }
  for (const s of wing) s.missiles = Math.min(s.missiles, 4);

  // --- choosing: turning on the convoy is the choice -------------------------------------------
  let turned = checkpoint === 2;
  let choosing = false;
  // firing on your own convoy at any point is the choice, made early
  const turn = () => {
    turned = true;
  };
  g.onBetrayal = (f) => {
    if (f === convoyFaction) turn();
  };
  g.onKill((ship, by) => {
    if (by?.isPlayer && convoy.includes(ship)) turn();
    if (by?.isPlayer && ship.faction === convoyFaction && choosing) turn();
  });

  // =============================================================================================
  if (checkpoint === 0) {
    await escort();
  }
  async function escort(): Promise<void> {
    g.setMusicIntensity(0.25);
    g.objective = side === 'combine' ? 'Escort the delegation to Kestrel' : 'Escort the Magpie\'s hauler to the Sovereign Dawn';
    if (side === 'combine') {
      await g.say('tessaine', 'Rook. Today the Accord is signed aboard Kestrel, and the Combine arrives in good order. Escort the delegation to bay one.');
      await g.say('varga', 'Sovereign Dawn, Kestrel Control. Delegation shuttles are cleared for bay one. Welcome to the table.');
      await g.say('juno', 'Kestrel militia on station defence today, Rook. Strange to be on the same side as you lot.');
      await g.say('vale', 'Lance flight, loose escort. Nobody gets near those shuttles.');
    } else {
      await g.say('sorrel', 'Rook. Today we sign the Accord with the Combine, and the Drift bring a gift. The Magpie is flying a hauler of refined ore to the Sovereign Dawn. Escort him in.');
      await g.say('magpie', 'Nice and slow, Rook. Nobody rushes a gift.');
      await g.say('varga', 'Hauler Tithe, Kestrel Control. You are cleared to the Dawn\'s east cradle. Mind the paint.');
      await g.say('kit', 'Kit and one more on your wing. Quiet day, they said.');
    }
    g.hint(pad() ? 'Stay close to the convoy. Y targets the nearest threat' : `Stay close to the convoy. ${key('targetNearest')} targets the nearest threat`, 6);
    await g.until(() => turned || progress() >= (side === 'combine' ? 0.3 : 0.2) || convoy.every((s) => !s.alive));
    // the raid
    g.setMusicIntensity(0.75);
    if (turned) return;
    const at = convoy[0].pos.clone().add(v(500, 120, -300));
    const raid = wakeRaid(at);
    holdConvoy(side === 'combine');
    if (side === 'combine') await g.say('vey', 'An Accord? With the Combine? Kestrel, you have the memory of a fish. Wake, take the shuttles.');
    else await g.say('vey', 'Ore for the Combine, from the Drift? Now I have heard everything. Wake, take that hauler.');
    g.objective = side === 'combine' ? 'Protect the delegation from the Red Wake' : 'Protect the hauler from the Red Wake';
    if (side === 'combine') await g.say('vale', 'Delegation, hold position. Lance flight, break and engage!');
    else await g.say('magpie', 'I am not stopping for anybody. Keep them off me!');
    await g.until(() => turned || alive(raid) === 0 || convoy.every((s) => !s.alive));
    if (turned) {
      // you shot the convoy in the middle of a Wake raid: Vey's people take the chance to leave
      g.retreat(raid);
      return;
    }
    g.retreat(raid);
    g.objective = '';
    g.setMusicIntensity(0.35);
    await g.wait(1.5);
  }

  // --- the reveal ------------------------------------------------------------------------------
  if (checkpoint <= 1 && !turned) {
    g.checkpoint = 1;
    holdConvoy(false);
    if (side === 'combine') {
      await g.say('juno', 'Rook, Juno. Control ran a scan on those shuttles while they sat still. Varga, are you seeing this?');
      await g.say('varga', 'Forty armed marines per shuttle. Breaching charges. Combine shuttles, heave to and power down. Now.');
      await g.say('tessaine', 'Kestrel Control, as of this hour Kestrel Station is under Combine protection. Do not resist. Rook, keep them moving, and keep the militia off them.');
      await g.say('vale', 'Commander. This was a peace summit.');
      await g.say('tessaine', 'It still is, Lieutenant. Ours.');
      await g.say('juno', 'Rook, you saw what we bled for the Wake. Do not do this.');
    } else {
      await g.say('juno', 'Rook, Juno. Control ran a scan on that hauler. That is not ore.');
      await g.say('varga', 'Mining charge. Three hundred tonnes of it. Magpie, if that goes into the Dawn\'s hangar it takes our east cradle with it. There are four hundred dock crew in there!');
      await g.say('magpie', 'Rook. I am sorry. Sorrel said it was the only way they would ever stop.');
      await g.say('sorrel', 'Nine hundred Combine soldiers, Rook, against every family they have starved out here. Keep him flying.');
      await g.say('tessaine', 'Kestrel, what is that hauler? Sovereign Dawn, battle stations. Sabres, intercept!');
    }
    g.setMusicIntensity(0.85);
    choosing = true;
    g.resetFriendlyFire(side === 'combine' ? 90 : 140);
    // the other side moves on the convoy, and on you while you guard it
    const against: Ship[] = [];
    if (side === 'combine') {
      g.setRelation('kestrel', 'combine', true);
      g.setRelation('kestrel', 'player', true);
      for (const s of militia) if (s.ai instanceof AIPilot) s.ai.playerBias = 0.25;
      against.push(...militia);
    } else {
      g.setRelation('combine', 'drift', true);
      g.setRelation('combine', 'player', true);
      against.push(...launchSabres(4, 'Dawn Sabre', { skill: 0.55, playerBias: 0.35, tactic: 'standoff' }));
    }
    g.objective = side === 'combine' ? 'Get the shuttles into bay 1, or shoot them down' : 'Get the hauler into the Dawn\'s hangar, or destroy it';
    g.hint(side === 'combine' ? 'Your call, Rook. Guard the shuttles and you stay with the Combine. Fire on them and you are with Kestrel and the Drift' : 'Your call, Rook. See the hauler in and you stay with the Drift. Destroy it and you are with the Combine', 10);
    await g.until(() => turned || arrived() || convoy.every((s) => !s.alive));
    choosing = false;
    if (!turned) {
      // retrying after this starts again at the choice
      await stayed(g, side, convoy, against, militia, wing, destination, patience ?? bringPatience(false));
      return;
    }
    g.checkpoint = 2;
  }
  // checkpoint 2: restart after turning
  await turnedOn(g, side, convoy, militia, wing, launchSabres, () => patience ?? bringPatience(true), checkpoint === 2);
}

/** You saw it through. */
async function stayed(g: Game, side: 'combine' | 'drift', convoy: Ship[], against: Ship[], militia: Ship[], wing: Ship[], destination: THREE.Vector3, patience: CapitalShip): Promise<void> {
  void wing;
  if (side === 'combine') {
    if (convoy.some((s) => s.alive)) {
      await g.say('varga', 'They are in the bay. Marines on the deck. All militia, stand down. Kestrel yields.');
      await g.say('juno', 'Rook. I hope they pay you well.');
      g.retreat(militia);
      g.missionFlags.kestrel = 'seized';
    } else {
      await g.say('tessaine', 'The delegation is lost. Rook, you will explain this to me in person.');
      await g.say('varga', 'Kestrel holds. Whatever the Combine tells you, Rook, we saw what was on those shuttles.');
      g.missionFlags.kestrel = 'held';
    }
    g.setRelation('kestrel', 'player', false);
    g.objective = 'Return to the Sovereign Dawn';
    g.setMusicIntensity(0.3);
    await g.dock(['carrier.hangar']);
  } else {
    if (convoy.some((s) => s.alive)) {
      await g.say('magpie', 'Charge is armed. Punching out. Goodbye, Rook.');
      const blast = convoy[0].alive ? convoy[0].pos.clone() : destination.clone();
      if (convoy[0].alive) destroy(g, convoy[0]);
      g.detonate(blast, 4.5, 260, 900);
      await g.wait(1.5);
      await g.say('tessaine', 'All decks, damage control! The hangar is gone. The east cradle is gone. Rook, every ship in the Combine will hunt you for this.');
      await g.say('varga', 'Kestrel, all stations, fire crews to the east cradle. Oh, God.');
      g.missionFlags.dawn = 'burned';
    } else {
      await g.say('magpie', 'Tithe is breaking up! Punching out!');
      await g.say('sorrel', 'We lost the hauler. Rook, cover the retreat.');
      g.missionFlags.dawn = 'spared';
    }
    const fury = launchFrom(g, 4);
    g.objective = 'Cover the Drift withdrawal';
    g.armCapital(patience, true, 0.6);
    await g.until(() => alive([...fury, ...against]) === 0);
    sweep(g, [...fury, ...against]);
    await g.say('sorrel', 'It is done. Come home, Rook.');
    g.objective = 'Land on the Long Patience';
    g.setMusicIntensity(0.3);
    await g.dock(['patience.hangar']);
  }
  await g.wait(0.5);
  g.endMission('victory');
}

/** Kills a ship outright (scripted: a charge, a self-destruct). */
function destroy(g: Game, s: Ship): void {
  g.onShipHit(s, s.hull + s.shields + 1, null, s.pos.clone(), 'missile');
}

/** Sabres from the Dawn, for after the blast. */
function launchFrom(g: Game, n: number): Ship[] {
  const frame = g.location.frames.carrier;
  const out = v(1, 0, 0).transformDirection(frame);
  const ships: Ship[] = [];
  for (let i = 0; i < n; i++) {
    const p = v(100, -20, [-95, -75, -55][i % 3] + Math.floor(i / 3) * 6).applyMatrix4(frame);
    const s = g.spawnShip('sabre', 'combine', 'Dawn Sabre', p, p.clone().add(out), { skill: 0.6, playerBias: 0.6, tactic: 'swarm', speed: 0 });
    g.catapult(s);
    ships.push(s);
  }
  return ships;
}

/** You turned on your own side. */
async function turnedOn(
  g: Game,
  side: 'combine' | 'drift',
  convoy: Ship[],
  militia: Ship[],
  wing: Ship[],
  launchSabres: (n: number, name: string, opts: { skill: number; playerBias: number; tactic?: 'standoff' | 'flanker' | 'swarm' }) => Ship[],
  getPatience: () => CapitalShip,
  restart: boolean,
): Promise<void> {
  const hub = g.points['station.hub'];
  g.setMusicIntensity(1);
  g.resetFriendlyFire(100000);
  if (side === 'combine') {
    // the Combine against you, Kestrel and the Drift with you
    g.setRelation('combine', 'player', true);
    g.setRelation('combine', 'kestrel', true);
    g.setRelation('combine', 'drift', true);
    g.setRelation('kestrel', 'player', false);
    for (const s of convoy) if (s.alive) destroy(g, s);
    if (!restart) {
      await g.say('tessaine', 'So the contractor has found a conscience. Sabre flight, launch. Kill that ship.');
      await g.say('vale', 'No. Not like this. Lance two, break off with me. We are done here.');
    }
    g.retreat(wing);
    if (!restart) await g.say('juno', 'Rook is with us! Militia, cover Rook!');
    g.objective = 'Survive the Combine strike';
    const first = launchSabres(5, 'Dawn Sabre', { skill: 0.6, playerBias: 0.6, tactic: 'standoff' });
    await g.until(() => alive(first) <= 2);
    const patience = getPatience();
    await g.say('sorrel', 'Kestrel, this is the Long Patience. We heard all of it. Rook, hold on, we are coming.');
    g.armCapital(patience, true, 0.6);
    const drift: Ship[] = [];
    for (let i = 0; i < 3; i++) drift.push(g.jumpIn('gannet', 'drift', 'Drift escort', hub.clone().add(v(-500 + i * 50, 300, 700)), hub, { skill: 0.6, playerBias: 0, damageScale: 0.6 }));
    for (const s of drift) s.missiles = 4;
    const second = launchSabres(4, 'Dawn Sabre', { skill: 0.6, playerBias: 0.5, tactic: 'flanker' });
    await g.until(() => alive([...first, ...second]) === 0);
    sweep(g, [...first, ...second]);
    await g.say('tessaine', 'All wings, recover. Sovereign Dawn is casting off. This is not finished, Rook.');
    await g.say('sorrel', 'Kestrel is free, and so are you, Rook. You fly with the Drift now. Come in to bay one.');
    g.missionFlags.kestrel = 'free';
    g.missionFlags.defect = 'drift';
    g.objective = 'Land at Kestrel bay 1';
    g.setMusicIntensity(0.3);
    await g.dock(['kestrel.bay1']);
  } else {
    // the Drift against you, the Combine with you
    const patience = getPatience();
    g.setRelation('drift', 'player', true);
    g.setRelation('combine', 'player', false);
    g.setRelation('combine', 'drift', true);
    if (convoy[0]?.alive) {
      // the charge goes up out here, far from anyone it was meant for
      g.detonate(convoy[0].pos, 3.5, 0, 0);
      destroy(g, convoy[0]);
    }
    if (!restart) {
      await g.say('magpie', 'Rook? Rook, what have you done? Punching out!');
      await g.say('sorrel', 'So. You have chosen them. Drift wings, the contractor is no friend of ours.');
      await g.say('kit', 'I flew beside you, Rook!');
      await g.say('tessaine', 'Contractor. You just saved four hundred people and my ship. Sabre flight, cover that pilot.');
    }
    for (const s of wing) if (s.alive && s.ai instanceof AIPilot) s.ai.playerBias = 0.7;
    const allies = launchSabres(3, 'Dawn Sabre', { skill: 0.6, playerBias: 0, tactic: 'standoff' });
    void allies;
    g.armCapital(patience, true, 0.6);
    g.objective = 'Fight off the Drift wings';
    const hunters: Ship[] = [...wing];
    const bays = patience.bays;
    for (let i = 0; i < 5; i++) {
      const bay = bays[i % bays.length];
      const p = patience.toWorld(bay.pos);
      const dir = bay.out.clone().transformDirection(patience.root.matrixWorld);
      const s = g.spawnShip(i < 2 ? 'bulwark' : 'gannet', 'drift', 'Drift hunter', p, p.clone().add(dir), { skill: 0.6, playerBias: 0.7, tactic: 'flanker', speed: 0 });
      s.placeAt(p, p.clone().add(dir), 0);
      s.missiles = Math.min(s.missiles, 6);
      g.catapult(s);
      hunters.push(s);
    }
    await g.until(() => alive(hunters) === 0);
    sweep(g, hunters);
    g.armCapital(patience, false);
    patience.goal = v(-6000, 400, 4000);
    patience.speed = 30;
    await g.say('sorrel', 'Long Patience, come about. We are leaving. Remember this day, Rook. The Drift will.');
    await g.say('tessaine', 'Rook, the Combine pays its debts. Come aboard the Dawn.');
    g.missionFlags.dawn = 'saved';
    g.missionFlags.defect = 'combine';
    g.objective = 'Land on the Sovereign Dawn';
    g.setMusicIntensity(0.3);
    await g.dock(['carrier.hangar']);
  }
  void militia;
  await g.wait(0.5);
  g.endMission('victory');
}
