import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { RoutePilot } from '../entities/ai';
import { SHIP_CLASSES, type ShipClass } from '../entities/shipClasses';
import type { CapitalShip } from '../entities/capitalShip';
import type { FactionId } from '../entities/factions';
import type { Campaign } from './loadout';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
/** Ships still in the fight: anything more than 4 km out has run. */
const alive = (ships: Ship[]): number => ships.filter((s) => s.alive && s.pos.length() < 4000).length;
const sweep = (g: Game, ships: Ship[]): void => {
  g.retreat(ships);
};
const gunsLeft = (cap: CapitalShip): number => cap.turrets.filter((t) => t.ship.alive).length;

/** Fighters off a capital ship's launch bays. */
export function launchFrom(
  g: Game,
  cap: CapitalShip,
  classes: string[],
  faction: FactionId,
  name: string,
  opts: { skill: number; playerBias: number; tactic?: 'standoff' | 'flanker' | 'swarm'; missiles?: number },
): Ship[] {
  return classes.map((cls, i) => {
    const bay = cap.bays[i % cap.bays.length];
    const p = cap.toWorld(bay.pos.clone().add(v(0, 0, Math.floor(i / cap.bays.length) * 8)));
    const dir = bay.out.clone().transformDirection(cap.root.matrixWorld);
    const s = g.spawnShip(cls, faction, name, p, p.clone().add(dir), { skill: opts.skill, playerBias: opts.playerBias, tactic: opts.tactic, speed: 0 });
    s.placeAt(p, p.clone().add(dir), 0);
    if (opts.missiles !== undefined) s.missiles = Math.min(s.missiles, opts.missiles);
    g.catapult(s);
    return s;
  });
}

/** A hospital ship you can actually hurt (traffic ones are untouchable). */
const MERCY: ShipClass = { ...SHIP_CLASSES.hospital, targetable: true, name: 'Hospital ship Mercy of Haven', shields: 400, shieldRegen: 0, hull: 2600, maxSpeed: 46, boostSpeed: 46 };

/**
 * "Last Light" (Combine finale) at Haven, the Drift Union's home. The Combine fleet comes for
 * the Long Patience: break the Drift screen, silence the battlecruiser's guns until Sorrel
 * strikes her colours, and decide what to do about the hospital ship leaving Haven when
 * Tessaine orders it burned.
 */
export async function runLastLight(g: Game, checkpoint: number, c: Campaign): Promise<void> {
  const player = g.player as Ship;
  const H = (k: string) => g.points[`haven.${k}`];
  g.setRelation('combine', 'drift', true);
  g.setRelation('drift', 'player', true);
  g.friendlyFireLimit = 400;

  const dawn = g.spawnCapital('battlecruiser', 'combine', 'dawn', 'Sovereign Dawn', v(0, 220, 3100), v(0, 100, 0), { armed: true, skill: 0.5 });
  const patience = g.spawnCapital('battlecruiser', 'drift', 'patience', 'Long Patience', v(250, 60, 1050), v(250, 60, 3000), { armed: true, skill: 0.5 });
  const resolute = g.spawnCapital('destroyer', 'combine', 'resolute', 'Resolute', v(-500, 160, 2700), v(-300, 100, 1200), { armed: true, skill: 0.5 });
  resolute.goal = v(-350, 120, 1700);
  resolute.speed = 18;
  g.onFrame(() => {
    if (resolute.root.position.distanceTo(resolute.goal ?? resolute.root.position) < 200) resolute.speed = 0;
  });
  const startGuns = patience.turrets.length;
  // her guns hold until the screen is down: the Drift fighters are the first job
  const shieldGuns = (on: boolean) => patience.turrets.forEach((t) => (t.ship.invulnerable = on));
  shieldGuns(checkpoint === 0);
  // Haven's own guns
  const havenGuns: Ship[] = [];
  for (let i = 0; i < 5; i++) {
    const p = H(`gun${i}`);
    if (p) havenGuns.push(g.spawnShip('turret', 'drift', 'Haven gun', p.clone(), p.clone().multiplyScalar(2), { turret: true, skill: 0.45, playerBias: 0.4 }));
  }
  const wing = [0, 1, 2].map((i) =>
    g.spawnShip('sabre', 'combine', i === 0 ? 'Lt. Vale' : `Lance ${i + 1}`, v(-80 + i * 50, 240, 2700), patience.root.position, { skill: 0.6, playerBias: 0, damageScale: 0.6 }),
  );
  void wing;
  player.placeAt(v(40, 250, 2650), patience.root.position, 90);
  g.setMusicIntensity(0.5);

  const drift: Ship[] = [];
  if (checkpoint === 0) {
    g.objective = 'Break the Drift screen';
    await g.say('tessaine', 'This ends today, Rook. The Drift have gathered everything they have left at Haven, behind the Long Patience. Silence her guns and Sorrel will come to the table.');
    if (c.flags.dawn === 'saved') await g.say('tessaine', 'You saved my ship at Kestrel. Today you finish what that started.');
    else if (c.flags.kestrel === 'seized') await g.say('tessaine', 'Kestrel is under our protection now. Haven is the last place they can run to.');
    if (c.flags.records === 'broadcast') await g.say('vale', 'Since that broadcast went out, half our contractors have walked. It is just us, Commander.');
    await g.say('sorrel', 'Long Patience to all Drift. They have come to our home. Launch everything.');
    g.setMusicIntensity(0.9);
    drift.push(...launchFrom(g, patience, ['gannet', 'gannet', 'bulwark', 'gannet', 'fang'], 'drift', 'Drift defender', { skill: 0.6, playerBias: 0.5, tactic: 'flanker', missiles: 4 }));
    await g.until(() => {
      g.objective = `Break the Drift screen · ${alive(drift)} left`;
      return alive(drift) === 0;
    });
    sweep(g, drift);
  }

  // --- the Long Patience -------------------------------------------------------------------------
  g.checkpoint = 1;
  shieldGuns(false);
  g.setMusicIntensity(1);
  await g.say('vale', 'Screen is down. Her flank guns and barbettes, Rook. We will keep the fighters off you.');
  let mercy: Ship | null = null;
  let mercyOrdered = false;
  let wave = 0;
  let nextWave = g.missionTime + 40;
  const target = Math.ceil(startGuns * 0.5);
  // the Dawn's heavy batteries do their share: a broadside every so often takes out a gun
  launchFrom(g, dawn, ['sabre', 'sabre', 'sabre'], 'combine', 'Dawn Sabre', { skill: 0.6, playerBias: 0, tactic: 'standoff' }).forEach((s) => (s.damageScale = 0.6));
  let broadside = g.missionTime + 22;
  let firstBroadside = true;
  await g.until(() => {
    const left = gunsLeft(patience);
    const togo = Math.max(0, left - target);
    g.objective = `Silence the Long Patience · ${togo} ${togo === 1 ? 'gun' : 'guns'} to go${mercy?.alive && mercyOrdered ? ' · a hospital ship is leaving Haven' : ''}`;
    if (g.missionTime > broadside) {
      broadside = g.missionTime + 22;
      const guns = patience.turrets.filter((t) => t.ship.alive);
      const hit = guns[Math.floor(Math.random() * guns.length)];
      if (hit) {
        g.detonate(hit.ship.pos, 1.6, 0, 0);
        g.onShipHit(hit.ship, hit.ship.hull + hit.ship.shields + 1, null, hit.ship.pos.clone(), 'missile');
        if (firstBroadside) {
          firstBroadside = false;
          void g.say('quell', 'Dawn batteries firing for effect. One down. Keep at them, Rook.').catch(() => undefined);
        }
      }
    }
    if (wave < 2 && g.missionTime > nextWave) {
      wave++;
      nextWave = g.missionTime + 45;
      drift.push(...launchFrom(g, patience, ['gannet', 'bulwark', 'gannet'], 'drift', 'Drift defender', { skill: 0.6, playerBias: 0.6, tactic: 'flanker', missiles: 4 }));
    }
    if (!mercyOrdered && left <= startGuns * 0.65) {
      mercyOrdered = true;
      const route = [v(300, 120, 420), v(900, 260, 1500), v(1800, 380, 2300), v(3200, 400, 2600)];
      mercy = g.spawnShip(MERCY, 'drift', 'Mercy of Haven', v(200, 60, 260), route[0], { speed: 20 });
      const rp = new RoutePilot(route, 1, 150);
      mercy.ai = rp;
      void (async () => {
        await g.say('tessaine', 'Rook. A hospital ship is leaving Haven. Our scans read Drift pilots aboard. Burn it.');
        await g.say('vale', 'Commander, that is a hospital ship.');
        await g.say('sorrel', 'Tessaine, it is full of wounded! For pity\'s sake, let it go!');
        await g.until(() => !mercy?.alive || rp.done);
        if (mercy?.alive) {
          g.jumpOut(mercy);
          g.missionFlags.mercy = 'spared';
          await g.say('tessaine', 'Rook. I gave you an order.');
          await g.say('vale', 'Sensor ghost, Commander. Must have been.');
        } else {
          g.missionFlags.mercy = 'burned';
          await g.say('vale', 'God help us.');
        }
      })().catch(() => undefined);
    }
    return left <= target;
  });

  // --- Sorrel strikes her colours ----------------------------------------------------------------
  g.armCapital(patience, false);
  for (const t of havenGuns) if (t.alive) t.ai = null;
  sweep(g, drift);
  g.setMusicIntensity(0.4);
  await g.say('sorrel', 'Enough. Enough. Long Patience, power down your guns. Commander Tessaine, the Drift will sign.');
  await g.say('tessaine', 'All Combine units, cease fire. Mother Sorrel, you will find our terms generous. Rook, come home.');
  await g.until(() => !mercyOrdered || !!g.missionFlags.mercy);
  g.missionFlags.finale = 'combine';
  g.objective = 'Land on the Sovereign Dawn';
  g.armCapital(dawn, false);
  g.armCapital(resolute, false);
  await g.dock(['dawn.hangar']);
  await g.wait(0.5);
  g.endMission('victory');
}


/** Bastion's shield pylon emitters. */
const PYLON: ShipClass = { ...SHIP_CLASSES.relay, id: 'pylon', name: 'Shield pylon', hull: 800, shields: 350, radius: 16, bounty: 2500 };

/**
 * "The Bastion" (Drift finale) at Bastion, the Combine's fortress in the Reach. Bring down the
 * four shield pylons, then silence the fortress batteries with the Long Patience's broadsides
 * behind you, until the Combine pulls out of the Reach. Who flies with you depends on what you
 * did at Kestrel.
 */
export async function runBastion(g: Game, checkpoint: number, c: Campaign): Promise<void> {
  const player = g.player as Ship;
  const B = (k: string) => g.points[`bastion.${k}`];
  g.setRelation('combine', 'drift', true);
  g.setRelation('combine', 'player', true);
  g.setRelation('kestrel', 'combine', true);
  g.friendlyFireLimit = 400;

  const patience = g.spawnCapital('battlecruiser', 'drift', 'patience', 'Long Patience', v(0, 160, 2700), v(0, 60, 0), { armed: true, skill: 0.5 });
  const dawn = g.spawnCapital('battlecruiser', 'combine', 'dawn', 'Sovereign Dawn', v(700, 100, 700), v(0, 160, 2700), { armed: true, skill: 0.55 });
  // the shield: a pale dome round the core while the pylons stand
  const dome = new THREE.Mesh(
    new THREE.IcosahedronGeometry(640, 4),
    new THREE.MeshBasicMaterial({ color: '#5fe8ff', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  g.addDecor(dome);
  g.onFrame(() => {
    (dome.material as THREE.MeshBasicMaterial).opacity = 0.05 + Math.sin(g.time * 2) * 0.02;
  });
  const pylons: Ship[] = checkpoint === 0 ? [0, 1, 2, 3].map((i) => g.spawnShip(PYLON, 'combine', 'Shield pylon', B(`pylon${i}`).clone(), B('center'), {})) : [];
  const batteries: Ship[] = [0, 1, 2, 3, 4, 5].map((i) =>
    g.spawnShip('cannon', 'combine', 'Bastion battery', B(`battery${i}`).clone(), patience.root.position, { turret: true, skill: 0.5, playerBias: 0.4 }),
  );
  const shield = (on: boolean) => {
    dome.visible = on;
    for (const s of batteries) s.invulnerable = on;
  };
  shield(checkpoint === 0);

  const allies: Ship[] = [0, 1].map((i) => g.spawnShip('gannet', 'drift', i === 0 ? 'Kit' : 'Drift escort', v(-60 + i * 50, 200, 2350), B('center'), { skill: 0.6, playerBias: 0, damageScale: 0.6 }));
  if (c.flags.kestrel === 'free') {
    allies.push(g.spawnShip('warden', 'kestrel', 'Juno', v(-150, 230, 2400), B('center'), { skill: 0.65, playerBias: 0, damageScale: 0.6 }));
    allies.push(g.spawnShip('warden', 'kestrel', 'Pike', v(-190, 210, 2440), B('center'), { skill: 0.6, playerBias: 0, damageScale: 0.6 }));
  }
  for (const s of allies) s.missiles = Math.min(s.missiles, 4);
  player.placeAt(v(40, 230, 2300), B('center'), 90);
  g.setMusicIntensity(0.5);

  const enemies: Ship[] = [];
  const drones = (n: number, at: THREE.Vector3) => {
    for (let i = 0; i < n; i++) enemies.push(g.jumpIn('drone', 'combine', 'Combine drone', at.clone().add(v((i % 4) * 30 - 45, Math.floor(i / 4) * 30, 0)), patience.root.position, { skill: 0.45, playerBias: 0.4 }));
  };

  if (checkpoint === 0) {
    g.objective = 'Bring down the shield pylons';
    await g.say('sorrel', 'This is where the Combine runs the Reach from, Rook. Bastion. Its shield is fed by four pylons at the ends of the arms. Bring them down and the batteries are ours to break.');
    if (c.flags.records === 'broadcast') await g.say('sorrel', 'Since the broadcast, their own contractors have been walking off. Bastion is half-crewed today. It will never be weaker.');
    if (c.flags.kestrel === 'free') await g.say('juno', 'Kestrel militia, with you, Rook. You stood by us. We stand by you.');
    if (c.flags.dawn === 'burned') await g.say('tessaine', 'The pilot who burned my hangar. I have been waiting for you, Rook.');
    else await g.say('tessaine', 'Mother Sorrel. You have brought a battlecruiser to a fortress. Sovereign Dawn, launch all wings.');
    g.setMusicIntensity(0.9);
    enemies.push(...launchFrom(g, dawn, ['sabre', 'sabre', 'sabre', 'sabre'], 'combine', 'Dawn Sabre', { skill: 0.6, playerBias: 0.5, tactic: 'standoff' }));
    drones(8, v(300, 300, 1200));
    let wave = 0;
    let nextWave = g.missionTime + 50;
    await g.until(() => {
      const left = pylons.filter((p) => p.alive).length;
      g.objective = `Bring down the shield pylons · ${left} left`;
      if (wave < 2 && g.missionTime > nextWave) {
        wave++;
        nextWave = g.missionTime + 50;
        enemies.push(...launchFrom(g, dawn, ['sabre', 'sabre', 'sabre'], 'combine', 'Dawn Sabre', { skill: 0.6, playerBias: 0.5, tactic: wave === 1 ? 'flanker' : 'standoff' }));
      }
      return left === 0;
    });
    shield(false);
    await g.say('kit', 'Shield is down! The whole thing just flickered out!');
  }

  g.checkpoint = 1;
  shield(false);
  g.setMusicIntensity(1);
  await g.say('sorrel', 'Long Patience, all batteries, fire on the fortress. Rook, the guns on the arms and the tiers. Silence them.');
  drones(10, v(-300, 200, 1000));
  let broadside = g.missionTime + 20;
  let first = true;
  await g.until(() => {
    const left = batteries.filter((s) => s.alive).length;
    g.objective = `Silence Bastion's batteries · ${left} left`;
    if (g.missionTime > broadside) {
      broadside = g.missionTime + 25;
      const live = batteries.filter((s) => s.alive);
      const hit = live[Math.floor(Math.random() * live.length)];
      if (hit) {
        g.detonate(hit.pos, 1.8, 0, 0);
        g.onShipHit(hit, hit.hull + hit.shields + 1, null, hit.pos.clone(), 'missile');
        if (first) {
          first = false;
          void g.say('magpie', 'Long Patience gunnery here. That one is ours. Find us another.').catch(() => undefined);
        }
      }
    }
    return left === 0;
  });

  // the Combine leaves the Reach
  g.armCapital(dawn, false);
  sweep(g, enemies);
  g.setMusicIntensity(0.4);
  await g.say('tessaine', 'Bastion is lost. All Combine units, withdraw. Sovereign Dawn, take us out. The Reach is yours, Mother Sorrel. For now.');
  dawn.goal = v(5000, 300, -5000);
  dawn.speed = 40;
  await g.say('sorrel', 'For good, Commander. Rook. It is over. Come home.');
  g.missionFlags.finale = 'drift';
  g.objective = 'Land on the Long Patience';
  g.armCapital(patience, false);
  await g.dock(['patience.hangar']);
  await g.wait(0.5);
  g.endMission('victory');
}
