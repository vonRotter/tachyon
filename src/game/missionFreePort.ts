import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { AIPilot, RoutePilot } from '../entities/ai';
import { SHIP_CLASSES, type ShipClass } from '../entities/shipClasses';
import type { CapitalShip } from '../entities/capitalShip';
import type { PortTraffic } from './portTraffic';
import type { PortBay } from '../world/structures';
import { launchFrom } from './missionFinale';

/**
 * Free Port: a delivery to Saltmarket, the free port the Reach Patrol keeps. You land your cargo
 * in a bay; while the clamps are still on, the Red Wake jump in with two salvage cruisers and
 * try to take the port. You launch into the defence.
 *
 *  1. Fly in through the traffic and land in bay 18 (the Patrol's rules apply).
 *  2. The Wake arrive. Stop three waves of boarding craft before they reach the bays, while the
 *     cruisers walk their main guns onto the port's batteries.
 *  3. Silence the cruisers' guns. One breaks up; Vey limps away in the other.
 * Lose every battery, or let three boarding craft in, and the port yields.
 *
 * Underneath: the Wake came in on Combine corridor codes, and a Combine frigate arrives the
 * moment it is over to offer the port its protection. The Kestrel play, again.
 */

type Side = 'combine' | 'drift';
const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

const BAY = 18;
/** Where the cruisers jump in, and where they stop to shell the port. */
const LOCKJAW = { jump: v(2900, 300, -1300), hold: v(1250, 120, -500) };
const RANSOM = { jump: v(3300, -100, 1500), hold: v(1800, -120, 700) };
const RAIDERS_AT = v(2000, 150, 200);

/** A Wake boarding craft: a stripped shuttle full of people with guns, slow and soft. */
const BOARDER: ShipClass = { ...SHIP_CLASSES.shuttle, civilian: false, name: 'Wake boarding craft', hull: 260, shields: 60, shieldRegen: 0, maxSpeed: 64, boostSpeed: 64, bounty: 500 };

const gunsLeft = (cap: CapitalShip): number => cap.turrets.filter((t) => t.ship.alive).length;

export async function runFreePort(g: Game, checkpoint: number, side: Side): Promise<void> {
  const combine = side === 'combine';
  const player = g.player as Ship;
  const port = g.port as PortTraffic;
  const bay = port.bay(BAY);
  port.reserved.add(BAY);
  g.friendlyFireLimit = 300;
  const pad = () => g.input.device === 'gamepad';
  const key = (a: Parameters<typeof g.input.label>[0]) => g.input.label(a);

  // --- the delivery ---------------------------------------------------------------------------------
  if (checkpoint === 0) {
    g.setMusicIntensity(0.15);
    g.waypoints = [{ name: `BAY ${BAY}`, pos: bay.mouth, color: '#ffb547' }];
    g.objective = `Deliver the cargo · land in bay ${BAY}`;
    await g.wait(1.5);
    await g.say('okafor', 'Inbound pilot, Reach Patrol, Saltmarket. You are cleared for bay eighteen. Forty metres a second in the lanes, and guns cold inside five kilometres.');
    await g.say('brask', 'Welcome to Saltmarket. We do not care whose colours you fly, so long as you pay your berth.');
    if (combine) await g.say('vale', 'The trade office will sign for the case, Rook. Do not open it. Those are the Commander\'s words, not mine.');
    else await g.say('kit', 'The clinic is expecting you, Rook. Bay eighteen. Try not to rattle the crate, it is colder than you are.');
    g.hint(`Follow the lane in to bay 18. ${pad() ? 'Press X' : `Press ${key('dock')}`} for docking clearance on the approach`, 6);
    await g.dock([`saltmarket.bay${BAY}`]);
    g.waypoints = [];
    g.objective = 'Unloading';
    await g.wait(2);
    if (combine) {
      await g.say('brask', 'Bay eighteen, one sealed case for the Combine trade office. They opened it before the bay door shut. Eager people.');
    } else {
      await g.say('brask', 'Bay eighteen, one crate of fever vaccine for the clinic. Thank Mother Sorrel for us. It has been going round the low decks.');
    }
    await g.wait(1);
    await g.say('okafor', 'All stations, jump signatures to the east. A lot of them. That is not a convoy.');
  }

  // --- the Wake arrive ----------------------------------------------------------------------------------
  g.checkpoint = Math.max(checkpoint, 1);
  g.setRelation('wake', 'patrol', true);
  port.panic();
  g.setMusicIntensity(0.9);
  const atHold = checkpoint >= 2;
  const lockjaw = g.spawnCapital('reaver', 'wake', 'lockjaw', 'Lockjaw', atHold ? LOCKJAW.hold : LOCKJAW.jump, v(0, 0, 0), { armed: true, skill: 0.5 });
  const ransom = g.spawnCapital('reaver', 'wake', 'ransom', 'Ransom', atHold ? RANSOM.hold : RANSOM.jump, v(0, 0, 0), { armed: true, skill: 0.5 });
  const cruisers = [
    { cap: lockjaw, hold: LOCKJAW.hold, name: 'Lockjaw' },
    { cap: ransom, hold: RANSOM.hold, name: 'Ransom' },
  ];
  for (const c of cruisers) {
    if (!atHold) {
      g.fx.jumpIn(c.cap.root.position.clone(), c.cap.forward(new THREE.Vector3()), '#ff5a3a');
      g.audio.jumpIn(c.cap.root.position);
      c.cap.goal = c.hold.clone();
      c.cap.speed = 34;
    }
  }
  // armoured gun mounts: the cruisers are the pilot's job, not the Patrol's
  for (const c of cruisers) for (const t of c.cap.turrets) t.ship.damageScale = 0.7;
  // the Patrol fly cover for the port: fighters and boarders first, guns only when nothing else flies
  let retask = 0;
  g.onFrame((dt) => {
    retask -= dt;
    if (retask > 0) return;
    retask = 2;
    const prey = g.ships.filter((s) => s.alive && s.faction === 'wake' && !s.cls.anchored);
    for (const p of port.patrols) {
      if (!p.alive || !(p.ai instanceof AIPilot) || p.ai.forcedTarget?.alive) continue;
      let best: Ship | null = null;
      let bd = Infinity;
      for (const s of prey) {
        const d = s.pos.distanceToSquared(p.pos);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      p.ai.forcedTarget = best;
    }
  });
  // the cruisers stop at their firing positions
  g.onFrame(() => {
    for (const c of cruisers) {
      // a capital ship turns too slowly to hit a point: near enough is its firing position
      if (c.cap.goal && c.cap.root.position.distanceTo(c.hold) < 220) {
        c.cap.goal = null;
        c.cap.speed = 0;
      }
    }
  });
  const wake: Ship[] = [];
  const raiders = (n: number, at: THREE.Vector3) => {
    for (let i = 0; i < n; i++) {
      const cls = i % 4 === 0 ? 'fang' : 'raider';
      wake.push(g.jumpIn(cls, 'wake', cls === 'fang' ? 'Wake Fang' : 'Wake raider', at.clone().add(v((i % 3) * 40 - 40, Math.floor(i / 3) * 30, (i % 2) * 40)), v(0, 0, 0), { skill: 0.5, playerBias: 0.55, flares: 1 }));
    }
  };
  raiders(checkpoint >= 2 ? 5 : 8, RAIDERS_AT);

  g.objective = 'Defend Saltmarket';
  if (checkpoint === 0) {
    // you are still on the pad: the clamps let go and you are thrown out of the bay
    g.closeDocking();
    g.catapult(player);
  } else {
    player.placeAt(bay.mouth.clone().addScaledVector(bay.out, 120), bay.mouth.clone().addScaledVector(bay.out, 600), 60);
  }
  if (checkpoint < 2) {
    await g.say('vey', 'Saltmarket. This is Kaspar Vey. Your Patrol has had the run of this port long enough. Open your bays and nobody burns.');
    await g.say('brask', 'All traffic, abort your approach! Every bay, launch whatever can fly!');
    await g.say('okafor', 'Rook, is it? You have guns. Use them. Patrol, weapons free!');
    if (combine) await g.say('vale', 'Rook, those cruisers came through on Combine corridor codes. Our codes. I am going to want to know how.');
    else await g.say('kit', 'Rook, those cruisers squawked Combine corridor codes on the way in. Somebody opened the door for them.');
  }

  // the cruisers walk their main guns onto the port's batteries until their guns are silenced
  // (slowly while you are busy with the boarders, faster once the cruisers are the job)
  let salvoEvery = checkpoint >= 2 ? 40 : 60;
  let salvo = g.missionTime + (checkpoint >= 2 ? 15 : 28);
  let warned = false;
  g.onFrame(() => {
    if (g.missionTime < salvo) return;
    salvo = g.missionTime + salvoEvery;
    for (const c of cruisers) {
      if (!g.capitals.includes(c.cap) || !gunsLeft(c.cap) || c.cap.goal) continue;
      // they finish one battery before moving to the next
      const live = port.batteries.filter((s) => s.alive).sort((a, b) => a.hull - b.hull);
      const hit = live[0];
      if (!hit) return;
      // a main-gun shell goes straight through the shield: a quarter of the battery each time
      g.detonate(hit.pos, 1.6);
      hit.shields = 0;
      g.onShipHit(hit, hit.cls.hull * 0.25, null, hit.pos.clone(), 'missile');
      if (!warned) {
        warned = true;
        void g.say('okafor', 'The cruisers are walking their main guns onto our batteries. Lose them all and we cannot hold the port.').catch(() => undefined);
      }
    }
  });
  const batteriesLeft = () => port.batteries.filter((s) => s.alive).length;

  // reinforcements: raiders off the cruisers' belly bays while the fight lasts, gunships early on
  const startedAt = g.missionTime;
  let nextLaunch = startedAt + 30;
  const brutes = checkpoint >= 2 ? [] : [40, 85];
  g.onFrame(() => {
    const t = g.missionTime;
    if (brutes.length && t > startedAt + brutes[0]) {
      brutes.shift();
      wake.push(g.jumpIn('brute', 'wake', 'Wake gunship', RAIDERS_AT.clone().add(v(-200, 80, 300)), v(0, 0, 0), { skill: 0.5, playerBias: 0.6, flares: 3 }));
      void g.say('okafor', 'Wake gunship, east side! Somebody get on its tail.').catch(() => undefined);
    }
    if (t > nextLaunch) {
      nextLaunch = t + 32;
      const flying = wake.filter((s) => s.alive).length;
      const from = cruisers.find((c) => g.capitals.includes(c.cap) && gunsLeft(c.cap) && !c.cap.goal);
      if (from && flying < 10) wake.push(...launchFrom(g, from.cap, ['raider', 'raider', 'fang'], 'wake', `${from.name} raider`, { skill: 0.5, playerBias: 0.5 }));
    }
  });

  // fail: the batteries gone, or the Wake inside
  let boarded = 0;
  const lost = async (why: 'batteries' | 'boarded'): Promise<void> => {
    if (why === 'boarded') {
      await g.say('okafor', 'They are inside. Wake boarders on three decks. We cannot fight them in the corridors.');
      await g.say('brask', 'Then it is over. Saltmarket yields. Everyone, stand down.');
    } else {
      await g.say('brask', 'That was our last battery. All stations, Saltmarket yields.');
    }
    g.endMission('defeat', why === 'boarded' ? 'Three Wake boarding craft got inside Saltmarket.' : 'Every one of Saltmarket\'s batteries was destroyed.');
  };

  // --- the boarders ---------------------------------------------------------------------------------
  if (checkpoint < 2) {
    g.objective = 'Defend Saltmarket';
    const facing = (b: PortBay) => b.out.dot(v(1, 0, 0)) > 0.3 && b.number !== BAY;
    const targets = port.bays.filter(facing);
    const boarders: Ship[] = [];
    const wave = (n: number) => {
      // boarders launch from the belly hangars: a wrecked hangar launches nobody
      const sources = cruisers.map((c) => c.cap).filter((c) => g.capitals.includes(c) && !c.hangarDown);
      if (!sources.length) return;
      for (let i = 0; i < n; i++) {
        const src = sources[i % sources.length];
        const b = targets[Math.floor(Math.random() * targets.length)];
        const start = src.toWorld(src.bays[i % src.bays.length].pos.clone());
        const s = g.spawnShip(BOARDER, 'wake', 'Wake boarding craft', start, b.mouth, { speed: 30 });
        s.ai = new RoutePilot([b.mouth.clone().addScaledVector(b.out, 300).add(v(0, (i % 3) * 30 - 30, 0)), b.mouth.clone().addScaledVector(b.out, 20)], 0.9, 30);
        boarders.push(s);
        g.onFrame(() => {
          if (s.alive && s.pos.distanceTo(b.mouth) < 45) {
            // in through the bay mouth: gone from sight, and the port has Wake aboard
            s.alive = false;
            s.dispose(g.scene);
            boarded++;
            g.hint(`A boarding craft got into bay ${b.number}! ${3 - boarded > 0 ? `${3 - boarded} more and the port falls` : ''}`, 4);
          }
        });
      }
    };
    const waves = [3, 4, 4];
    let launched = 0;
    let nextWave = g.missionTime + 18;
    await g.until(() => {
      if (launched < waves.length && g.missionTime > nextWave) {
        wave(waves[launched]);
        if (launched === 0) {
          void g.say('okafor', 'Boarding craft off the cruisers! They are going for the bays. Stop them before they get inside!').catch(() => undefined);
          g.hint('Boarding craft are slow and soft: kill them before they reach the bays. Or wreck a cruiser\'s belly hangar, and it launches no more', 7);
        }
        launched++;
        nextWave = g.missionTime + 50;
      }
      const inbound = boarders.filter((s) => s.alive).length;
      g.objective = `Stop the boarding craft${inbound ? ` · ${inbound} inbound` : ''} · ${boarded}/3 got in · batteries ${batteriesLeft()}/4`;
      return boarded >= 3 || batteriesLeft() === 0 || (launched === waves.length && inbound === 0);
    });
    if (boarded >= 3) return lost('boarded');
    if (batteriesLeft() === 0) return lost('batteries');
    await g.say('okafor', 'That is the last of the boarders. Now the cruisers. Silence their guns and they stop shelling us.');
  }

  // --- silence the cruisers ---------------------------------------------------------------------------------
  g.checkpoint = 2;
  salvoEvery = 40;
  g.setMusicIntensity(1);
  let lockjawDown = false;
  let ransomDown = false;
  await g.until(() => {
    const l = g.capitals.includes(lockjaw) ? gunsLeft(lockjaw) : 0;
    const r = g.capitals.includes(ransom) ? gunsLeft(ransom) : 0;
    g.objective = `Silence the cruisers' guns · Lockjaw ${l} · Ransom ${r} · batteries ${batteriesLeft()}/4`;
    if (!lockjawDown && l === 0) {
      lockjawDown = true;
      void (async () => {
        await g.say('okafor', 'Lockjaw\'s guns are out! Her reactor is going, everyone clear of her!');
        await g.sinkCapital(lockjaw);
      })().catch(() => undefined);
    }
    if (!ransomDown && r === 0) ransomDown = true;
    return batteriesLeft() === 0 || (lockjawDown && ransomDown);
  });
  if (batteriesLeft() === 0) return lost('batteries');

  // Vey gets away, as he does: on his engines, or on the jump drive if you shot those out
  if (ransom.thrust > 0) await g.say('vey', 'All Wake, break off! Ransom is coming about. You have not seen the last of us, Saltmarket.');
  else await g.say('vey', 'All Wake, break off! Engines are gone, so jump us blind. You have not seen the last of us, Saltmarket.');
  g.retreat(wake);
  g.armCapital(ransom, false);
  ransom.goal = v(5000, -200, 2600);
  ransom.speed = 40;
  g.setMusicIntensity(0.4);
  await g.wait(6);
  g.removeCapital(ransom, true);
  await g.wait(1);
  await g.say('okafor', 'Wake is running. Saltmarket holds. Patrol, form up and count heads.');
  await g.say('brask', 'Rook. Whoever pays you, this port owes you one. We will not forget it.');

  // and the Combine arrive, just in time to offer their protection
  const probityAt = v(900, 300, 1900);
  const probity = g.spawnCapital('frigate', 'combine', 'probity', 'Probity', probityAt, v(0, 0, 0), { armed: false });
  g.fx.jumpIn(probityAt, probity.forward(new THREE.Vector3()), '#8fd8ff');
  g.audio.jumpIn(probityAt);
  await g.wait(1.5);
  await g.say('tessaine', 'Saltmarket, this is Commander Tessaine of the Helion Combine. We heard you were attacked. The Combine offers this port its protection, for as long as it needs it.');
  await g.say('okafor', 'Now they turn up.');
  await g.say('brask', 'The council will consider your offer, Commander. Tonight, I expect.');
  if (combine) {
    await g.say('tessaine', 'Well flown, Rook. Saltmarket will remember who stood at its door. Come home.');
    await g.say('vale', 'Rook. That case you carried. I would very much like to know what was in it.');
  } else {
    await g.say('kit', 'A Combine frigate, right on cue. Like they had the time written down.');
    await g.say('sorrel', 'It is the Kestrel play again, Rook. Let the Wake raid a free port, then sell it protection. Come home. We have work to do.');
  }
  g.missionFlags.saltmarket = 'held';
  await g.wait(1);
  g.endMission('victory');
}
