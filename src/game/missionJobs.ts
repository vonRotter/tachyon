import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { RoutePilot } from '../entities/ai';
import { SHIP_CLASSES, type ShipClass } from '../entities/shipClasses';

/**
 * Side jobs: short repeatable contracts for anyone, whichever side you fly for. They pay full
 * every time, so they are where you earn the cash for a better hull between story chapters.
 */

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const alive = (ships: Ship[]): number => ships.filter((s) => s.alive && s.pos.length() < 5000).length;
const sweep = (g: Game, ships: Ship[]): void => {
  g.retreat(ships);
};

/** A Wake raiding party: cutters, fangs and drones jumping in around a point. */
function raid(g: Game, at: THREE.Vector3, look: THREE.Vector3, mix: { cutters?: number; fangs?: number; drones?: number; brute?: string }): Ship[] {
  const out: Ship[] = [];
  let k = 0;
  const spot = () => at.clone().add(v((k % 4) * 45 - 70, (k++ % 3) * 25, Math.floor(k / 4) * 40));
  for (let i = 0; i < (mix.cutters ?? 0); i++) out.push(g.jumpIn('raider', 'wake', 'Wake Cutter', spot(), look, { skill: 0.5, playerBias: 0.5, flares: i % 2 ? 2 : 0 }));
  for (let i = 0; i < (mix.fangs ?? 0); i++) {
    const s = g.jumpIn('fang', 'wake', 'Wake Fang', spot(), look, { skill: 0.6, playerBias: 0.55, flares: 2 });
    s.missiles = 3;
    out.push(s);
  }
  for (let i = 0; i < (mix.drones ?? 0); i++) out.push(g.jumpIn('drone', 'wake', 'Wake drone', spot(), look, { skill: 0.45, playerBias: 0.4 }));
  if (mix.brute) out.push(g.jumpIn('brute', 'wake', mix.brute, at.clone().add(v(0, -60, -120)), look, { skill: 0.55, playerBias: 0.4 }));
  return out;
}

/** "Patrol Bounty" in the Ashfall: hunt a Wake raiding party with two Reach Patrol Interdictors. */
export async function runBounty(g: Game): Promise<void> {
  const player = g.player as Ship;
  g.friendlyFireLimit = 250;
  const patrol = [0, 1].map((i) =>
    g.spawnShip(i === 0 ? 'warrant' : 'interdictor', 'patrol', i === 0 ? 'Sgt. Okafor' : 'Interdictor 6', player.pos.clone().add(v(-60 - i * 50, 20, 40)), v(0, 0, -1500), { skill: 0.65, playerBias: 0, damageScale: 0.5 }),
  );
  for (const s of patrol) s.missiles = 4;
  for (let i = 0; i < 2; i++) patrol.push(g.spawnShip('drone', 'patrol', 'Patrol drone', player.pos.clone().add(v(40 + i * 30, -20, 60)), v(0, 0, -1500), { skill: 0.45, playerBias: 0 }));
  g.setMusicIntensity(0.4);
  g.objective = 'Hunt the Wake raiders in the Ashfall';
  await g.say('okafor', 'Contractor, Okafor, Reach Patrol. The Wake have been jumping salvage crews out of the Ashfall. The bounty is posted per hull. Stay on my wing.');
  const waves: Parameters<typeof raid>[3][] = [{ cutters: 4, drones: 4 }, { cutters: 3, fangs: 2 }, { fangs: 2, drones: 4, brute: 'Wake gunship "Gutter"' }];
  const spots = [v(200, 60, -900), v(-500, -120, -1800), v(300, 100, -2700)];
  for (let w = 0; w < waves.length; w++) {
    const wave = raid(g, spots[w], player.pos, waves[w]);
    g.setMusicIntensity(0.8);
    if (w === 0) await g.say('okafor', 'Contacts in the wreckage. Weapons free.');
    if (w === 1) await g.say('okafor', 'More of them, and those are Fangs. Short guns, very fast. Keep your distance and they cannot touch you.');
    if (w === 2) await g.say('okafor', 'Gunship! That is the Gutter, the one we came for. Take its escorts first.');
    await g.until(() => {
      g.objective = `Hunt the Wake raiders · wave ${w + 1} of 3 · ${alive(wave)} left`;
      return alive(wave) === 0;
    });
    sweep(g, wave);
    g.setMusicIntensity(0.35);
    await g.wait(2);
  }
  g.objective = '';
  await g.say('okafor', 'That is the lot. Bounties are filed to your account. Good hunting, contractor.');
  await g.wait(1);
  g.endMission('victory');
}

/** The ships you are paid to bring in: escortable and shootable, unlike traffic. */
const HAULER: ShipClass = { ...SHIP_CLASSES.container, civilian: false, shields: 600, shieldRegen: 8, shieldDelay: 4, hull: 3200, maxSpeed: 34 };

/** "Convoy Run" at Vantage: bring two container ships in through the rock ring. */
export async function runConvoy(g: Game): Promise<void> {
  const player = g.player as Ship;
  g.friendlyFireLimit = 300;
  const route = [v(2200, 280, -2300), v(1500, 200, -1500), v(800, 120, -1100), v(320, 60, -700)];
  const convoy: Ship[] = [];
  const pilots: RoutePilot[] = [];
  for (let i = 0; i < 2; i++) {
    const off = v(i * 90 - 45, i * 30, i * 120);
    const s = g.spawnShip(HAULER, 'kestrel', i === 0 ? 'Container ship Brisk' : 'Container ship Larkin', v(2900, 340, -3000).add(off), route[0], { speed: 0 });
    const rp = new RoutePilot(
      route.map((p) => p.clone().add(off)),
      0.6,
      120,
    );
    s.ai = rp;
    convoy.push(s);
    pilots.push(rp);
  }
  player.placeAt(v(2700, 420, -2800), route[0], 70);
  // the mission area is wherever the convoy is
  g.followArena(convoy[0]);
  g.onKill((s) => {
    const other = convoy.find((c) => c.alive);
    if (s === convoy[0] && other) g.followArena(other);
  });
  g.setMusicIntensity(0.3);
  g.objective = 'Escort the convoy to Vantage';
  await g.say('okafor', 'Contractor, the Patrol is stretched thin today, so this one is yours. Two container ships for Vantage, carrying spares for the array. The Wake know they are coming.');
  await g.say('halloran', 'Vantage here. We have been waiting on those parts for a month. Please bring them in whole.');
  const progress = () => pilots.reduce((m, p) => Math.max(m, p.progress), 0);
  const status = () => (g.objective = `Escort the convoy to Vantage · ${alive(convoy)} of 2 ships`);
  g.onFrame(status);
  const ambushes: Ship[] = [];
  await g.until(() => progress() >= 0.25 || alive(convoy) === 0);
  if (alive(convoy)) {
    g.setMusicIntensity(0.8);
    ambushes.push(...raid(g, convoy[0].pos.clone().add(v(-500, 200, 300)), convoy[0].pos, { cutters: 4, drones: 6 }));
    await g.say('vey', 'Fat little ships, a long way from home. Wake, help yourselves.');
  }
  await g.until(() => progress() >= 0.6 || alive(convoy) === 0);
  if (alive(convoy)) {
    ambushes.push(...raid(g, convoy[0].pos.clone().add(v(400, -200, 400)), convoy[0].pos, { fangs: 3, drones: 4 }));
    await g.say('halloran', 'More of them coming out of the rocks! Hurry!');
  }
  await g.until(() => alive(convoy) === 0 || convoy.every((s, i) => !s.alive || pilots[i].done));
  sweep(g, ambushes);
  g.objective = '';
  const arrived = convoy.filter((s) => s.alive).length;
  if (!arrived) {
    await g.say('halloran', 'Both ships are gone. All of it, gone.');
    g.endMission('defeat', 'Both container ships were destroyed.');
    return;
  }
  g.bonusPay = arrived * 4000;
  await g.say('halloran', arrived === 2 ? 'Both ships docking. Thank you, pilot. Truly.' : 'One ship made it. It will have to do. Thank you, pilot.');
  await g.wait(1);
  g.endMission('victory');
}

/** Ore barges you guard: shootable, unlike traffic. */
const BARGE: ShipClass = { ...SHIP_CLASSES.miner, civilian: false, shields: 300, shieldRegen: 6, shieldDelay: 4, hull: 1600 };

/** "Ore Guard" in Kestrel's rock field: keep three ore barges alive against Wake strip-miners. */
export async function runOreGuard(g: Game): Promise<void> {
  const player = g.player as Ship;
  g.friendlyFireLimit = 300;
  const field = v(-1200, -120, 650);
  const barges = [v(-1050, -60, 520), v(-1320, -150, 760), v(-1180, -30, 860)].map((p, i) => {
    const s = g.spawnShip(BARGE, 'kestrel', `Ore barge ${['Hale', 'Moss', 'Tiller'][i]}`, p, field, { speed: 0 });
    // working the rocks: drifting slowly round the field
    s.ai = new RoutePilot([p.clone().add(v(80, 20, 0)), p.clone().add(v(0, -20, 80)), p.clone().add(v(-80, 0, 0)), p.clone()], 0.15, 40);
    return s;
  });
  player.placeAt(v(-700, 60, 300), field, 60);
  g.spawnShip('bulldog', 'kestrel', 'Gunboat Bulldog', v(-900, 40, 420), field, { skill: 0.55, playerBias: 0, damageScale: 0.5 });
  for (let i = 0; i < 2; i++) g.spawnShip('drone', 'kestrel', 'Kestrel drone', v(-880 + i * 40, 20, 470), field, { skill: 0.45, playerBias: 0 });
  g.setMusicIntensity(0.3);
  g.objective = 'Guard the ore barges';
  await g.say('varga', 'Rook, Kestrel Control. Wake strip-miners have been hitting our barges in the rock field. Three crews are working today. Keep them breathing.');
  const status = () => (g.objective = `Guard the ore barges · ${alive(barges)} of 3`);
  g.onFrame(status);
  const waves: Parameters<typeof raid>[3][] = [{ drones: 8 }, { drones: 6, cutters: 2 }, { drones: 8, fangs: 2 }];
  for (let w = 0; w < waves.length && alive(barges); w++) {
    const at = field.clone().add(v(Math.cos(w * 2.1) * 700, 150, Math.sin(w * 2.1) * 700));
    const wave = raid(g, at, field, waves[w]);
    g.setMusicIntensity(0.75);
    if (w === 0) await g.say('varga', 'Drones coming in over the rocks. They go for the barges, not you.');
    if (w === 2) await g.say('varga', 'Last lot, and they brought Fangs. Nearly there, Rook.');
    await g.until(() => alive(wave) === 0 || alive(barges) === 0);
    sweep(g, wave);
    g.setMusicIntensity(0.3);
    await g.wait(3);
  }
  g.objective = '';
  const left = alive(barges);
  if (!left) {
    await g.say('varga', 'We lost all three crews. Come in, Rook.');
    g.endMission('defeat', 'All three ore barges were destroyed.');
    return;
  }
  g.bonusPay = left * 2500;
  await g.say('varga', left === 3 ? 'All three crews safe. Drinks are on the rock miners tonight.' : 'We lost some, but not all. Thank you, Rook.');
  await g.wait(1);
  g.endMission('victory');
}
