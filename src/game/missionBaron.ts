import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { AIPilot, RoutePilot } from '../entities/ai';
import { SHIP_CLASSES, type ShipClass } from '../entities/shipClasses';
import type { Campaign } from './loadout';

/**
 * "The Scarlet Baron": a four-part side arc about Baron Rafe Delacourt, a former Combine ace
 * turned gentleman pirate. He announces himself, never fires on the helpless or on ejected
 * pilots, and robs only those who can afford it. Each part ends on a choice, and the last part
 * depends on what you made of him: a friend who gives you his spare fighter, or a quarry you
 * hunt down at his hideout.
 */

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const alive = (ships: Ship[]): number => ships.filter((s) => s.alive && s.pos.length() < 5000).length;
const sweep = (g: Game, ships: Ship[]): void => {
  g.retreat(ships);
};
const frac = (s: Ship): number => (s.hull + s.shields) / (s.cls.hull + s.cls.shields);

/** The Baron himself: the best pilot in the Reach, and he knows it. */
function spawnBaron(g: Game, pos: THREE.Vector3, look: THREE.Vector3, jump = true): Ship {
  const s = jump
    ? g.jumpIn('scarlet', 'rose', 'The Scarlet Baron', pos, look, { skill: 0.85, playerBias: 0.9, flares: 4 })
    : g.spawnShip('scarlet', 'rose', 'The Scarlet Baron', pos, look, { skill: 0.85, playerBias: 0.9, flares: 4 });
  s.missiles = 0;
  return s;
}

function spawnRosebuds(g: Game, around: THREE.Vector3, look: THREE.Vector3, names = ['Petal', 'Thorn', 'Bramble']): Ship[] {
  return names.map((n, i) => {
    const s = g.jumpIn('rosebud', 'rose', n, around.clone().add(v(i * 50 - 50, (i % 2) * 30, 40 + i * 20)), look, { skill: 0.6, playerBias: 0.6, flares: 2 });
    s.missiles = 0;
    return s;
  });
}

/** He stops fighting at once (and takes no more hits while he says his piece). */
function stand(baron: Ship): void {
  baron.ai = null;
  baron.controls.fire = false;
  baron.controls.throttle = 0.15;
  baron.invulnerable = true;
}

/**
 * The Baron yields: he stops fighting and drifts. Keep shooting and you shoot him down (he
 * ejects; returns 'shot'), hold your fire for `grace` seconds and you spare him ('spared').
 */
async function yieldMoment(g: Game, baron: Ship, grace = 12, pod = true): Promise<'spared' | 'shot'> {
  baron.ai = null;
  baron.controls.fire = false;
  baron.controls.throttle = 0.15;
  // a moment's grace for bolts already in flight, then every hit counts
  baron.invulnerable = true;
  await g.wait(3);
  baron.invulnerable = false;
  baron.damageScale = 1;
  const before = baron.hull + baron.shields;
  const until = g.missionTime + grace;
  let shot = false;
  await g.until(() => {
    if (!baron.alive || baron.hull + baron.shields < before - 1) shot = true;
    return shot || g.missionTime > until;
  });
  if (shot && baron.alive) {
    const at = baron.pos.clone();
    g.onShipHit(baron, baron.hull + baron.shields + 1, null, at.clone(), 'missile');
  }
  if (shot && pod) {
    // his escape pod drifts off: a little glowing capsule
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 2.2, 4, 10), new THREE.MeshBasicMaterial({ color: '#ff6a8a', toneMapped: false }));
    m.position.copy(baron.pos);
    g.addDecor(m);
    const drift = v(Math.random() - 0.5, 0.4, Math.random() - 0.5).normalize().multiplyScalar(14);
    g.onFrame((dt) => {
      m.position.addScaledVector(drift, dt);
      m.rotation.x += dt;
    });
  }
  return shot ? 'shot' : 'spared';
}

// =============================================================================================

/** The liner the Baron robs. */
const LINER: ShipClass = { ...SHIP_CLASSES.liner, civilian: false, name: 'Aurelian Dawn', shields: 1200, hull: 6000, maxSpeed: 44, boostSpeed: 44 };

/** Part 1, "A Rose for the Lady" (Vantage): the Baron robs the liner you are escorting. */
export async function runBaronRobbery(g: Game): Promise<void> {
  const player = g.player as Ship;
  g.setRelation('rose', 'player', false);
  g.setRelation('rose', 'combine', false);
  const route = [v(1600, 260, -1500), v(600, 240, -900), v(-700, 220, 300), v(-2400, 200, 1800)];
  const liner = g.spawnShip(LINER, 'combine', 'Aurelian Dawn', v(2600, 300, -2200), route[0], { speed: 0 });
  const rp = new RoutePilot(route, 0.6, 150);
  liner.ai = rp;
  player.placeAt(v(2500, 380, -2050), route[0], 50);
  g.setMusicIntensity(0.25);
  g.objective = 'Escort the liner Aurelian Dawn';
  await g.say('strand', 'Pilot, this is Lady Imelda Strand. My late husband\'s collection is aboard, and I would very much like it to arrive somewhere other than a pirate\'s parlour. Do keep up.');
  await g.until(() => rp.progress >= 0.25);
  rp.hold = true;
  const ahead = liner.pos.clone().add(v(-500, 80, 400));
  const baron = spawnBaron(g, ahead, liner.pos);
  const buds = spawnRosebuds(g, ahead.clone().add(v(0, -40, 60)), liner.pos);
  for (const s of [baron, ...buds]) s.ai = null;
  g.setMusicIntensity(0.5);
  await g.say('baron', 'Aurelian Dawn, good afternoon! Baron Rafe Delacourt, at your service, and at your hatch. Nobody need be hurt today. I require only the Strand collection, and perhaps a moment of Her Ladyship\'s company.');
  await g.say('strand', 'You are a thief, sir.');
  await g.say('baron', 'Madam, I am a collector. Like your late husband. We merely disagree about the paperwork.');
  await g.say('baron', 'And you, in the little ship. I have no quarrel with you. Hold your fire and you will see how civilised a robbery can be. Fire, and we shall dance.');
  g.hint('Hold your fire and let him take the cargo, or open fire and fight him off', 9);
  // the Rosebuds come alongside and start unloading
  buds.forEach((s, i) => s.placeAt(liner.pos.clone().add(v(i * 40 - 40, 40, 0)), liner.pos.clone().add(v(0, 0, -100)), 0));
  baron.placeAt(liner.pos.clone().add(v(0, 90, 120)), liner.pos, 0);
  let fight = false;
  g.resetFriendlyFire(30);
  g.onBetrayal = (f) => {
    if (f === 'rose') fight = true;
  };
  const start = g.missionTime;
  const unload = 30;
  await g.until(() => {
    g.objective = `The Baron is taking the cargo · ${Math.min(100, Math.round(((g.missionTime - start) / unload) * 100))}%`;
    return fight || g.missionTime - start > unload;
  });
  if (!fight) {
    g.objective = '';
    await g.say('petal', 'All aboard, Baron. Every last painting.');
    await g.say('baron', 'Splendid! Manners are so rare these days. A finder\'s fee for your restraint, contractor. Do spend it on something beautiful.');
    sweep(g, [baron, ...buds]);
    await g.say('strand', 'I will see that your contract pays what your courage was worth, pilot. Half.');
    g.bonusPay = -4500 + 7000;
    g.missionFlags.baron1 = 'let';
  } else {
    g.setRelation('rose', 'player', true);
    g.resetFriendlyFire(100000);
    for (const s of [baron, ...buds]) {
      const ai = new AIPilot(g, s === baron ? 0.85 : 0.6);
      ai.tactic = 'flanker';
      ai.playerBias = 0.9;
      s.ai = ai;
    }
    baron.damageScale = 0.4;
    g.setMusicIntensity(0.9);
    await g.say('baron', 'Ah! A dancer. Rosebuds, a waltz, if you please!');
    await g.say('petal', 'With pleasure, Baron.');
    await g.until(() => {
      g.objective = 'Drive off the Scarlet Baron';
      return frac(baron) < 0.45 || alive(buds) <= 1;
    });
    baron.invulnerable = true;
    await g.say('baron', 'Enough, enough! You have made your point, and quite spoiled my afternoon. Until next time, contractor. I shall remember your colours.');
    sweep(g, [baron, ...buds]);
    await g.say('strand', 'Thank you, pilot. My husband would have liked you. He liked anyone who was rude to pirates.');
    g.missionFlags.baron1 = 'fought';
  }
  g.objective = '';
  await g.wait(1);
  g.endMission('victory');
}

// =============================================================================================

/** Part 2, "Pistols at Dawn" (Ashfall): a duel at the dead destroyer, or a Patrol trap. */
export async function runBaronDuel(g: Game, c: Campaign): Promise<void> {
  const player = g.player as Ship;
  g.setRelation('rose', 'player', false);
  g.setRelation('rose', 'patrol', false);
  const wreck = v(-420, -80, -2300);
  const duelSpot = wreck.clone().add(v(300, 120, 300));
  const beacon = v(700, 250, -1300);
  player.placeAt(v(0, 150, 0), v(0, 0, -1500), 60);
  g.setMusicIntensity(0.25);
  g.objective = 'Choose: the duel at the wreck, or the Patrol beacon';
  if (c.flags.baron1 === 'fought') await g.say('baron', 'Contractor! A rose and a card, by way of apology for our last dance. The old destroyer in the Ashfall. One on one, guns only. Shall we settle it like civilised people?');
  else await g.say('baron', 'Contractor! You let me rob a lady, and I have not stopped wondering what you would be like in a fair fight. The old destroyer in the Ashfall. One on one, guns only. Do come.');
  await g.say('okafor', 'Contractor, Okafor. We read his card, it is our job. Fly to our beacon instead of that wreck and he flies into four Interdictors. Thirty thousand on his head.');
  await g.say('okafor', 'Or go and get yourself killed with honour. Your call.');
  g.waypoints = [
    { name: 'THE DUEL', pos: duelSpot, color: '#ff6a8a' },
    { name: 'PATROL BEACON', pos: beacon, color: '#8fb8ff' },
  ];
  g.hint('Where you fly is your answer', 6);
  let choice: 'duel' | 'trap' | null = null;
  await g.until(() => {
    if (player.pos.distanceTo(duelSpot) < 350) choice = 'duel';
    else if (player.pos.distanceTo(beacon) < 300) choice = 'trap';
    return choice !== null;
  });
  g.waypoints = [];
  g.objective = choice === 'duel' ? 'Meet the Baron at the wreck' : 'Wait at the Patrol beacon';

  if (choice === 'duel') {
    const baron = spawnBaron(g, duelSpot.clone().add(v(-400, 60, -300)), player.pos);
    baron.damageScale = 0.55;
    await g.say('baron', 'You came! And alone, I see. Then this is a proper morning. Guns only, contractor. Missiles are for people who do not trust their hands.');
    await g.say('baron', 'On my mark. Three. Two. One. En garde!');
    g.setRelation('rose', 'player', true);
    g.setMusicIntensity(1);
    g.objective = 'Duel the Scarlet Baron · guns only';
    const missilesAtStart = player.missiles;
    let cheated = false;
    let buds: Ship[] = [];
    await g.until(() => {
      if (!cheated && player.missiles < missilesAtStart) {
        cheated = true;
        buds = spawnRosebuds(g, baron.pos.clone().add(v(0, 80, 200)), player.pos);
        void (async () => {
          await g.say('baron', 'A missile? Oh, contractor. How very disappointing. Rosebuds!');
          await g.say('petal', 'Never trust a man who brings a launcher to a duel.');
        })().catch(() => undefined);
      }
      return frac(baron) < 0.3;
    });
    stand(baron);
    sweep(g, buds);
    g.missionFlags.duel = cheated ? 'missile' : 'fair';
    g.setMusicIntensity(0.4);
    await g.say('baron', 'Enough! Enough. Beautifully flown. I yield, contractor. My life is yours, to keep or to spend.');
    g.objective = 'He yields · hold your fire to spare him, or shoot him down';
    const outcome = await yieldMoment(g, baron);
    g.objective = '';
    if (outcome === 'spared') {
      await g.say('baron', 'Mercy. How terribly unfashionable of you. I owe you a life, contractor, and a Delacourt always pays his debts.');
      g.jumpOut(baron);
      g.missionFlags.baron2 = 'spared';
    } else {
      await g.say('baron', 'Ha! Well flown. Well flown indeed. Do tell the Patrol I said hello.');
      await g.say('okafor', 'We have his pod. The Scarlet Baron is in a Patrol cell, and the bounty is yours, contractor.');
      g.bonusPay = 30000;
      g.missionFlags.baron2 = 'downed';
    }
  } else {
    const patrol = [0, 1, 2, 3].map((i) =>
      g.jumpIn('interdictor', 'patrol', i === 0 ? 'Sgt. Okafor' : `Interdictor ${i + 4}`, beacon.clone().add(v(i * 60 - 90, 30, 0)), wreck, { skill: 0.65, playerBias: 0, damageScale: 0.5 }),
    );
    await g.say('okafor', 'Good choice. Now we wait.');
    await g.wait(6);
    const baron = spawnBaron(g, duelSpot.clone(), beacon);
    baron.ai = null;
    await g.say('baron', 'Contractor? I am a patient man, if not a punctual one.');
    await g.say('baron', 'Ah. Four Interdictors. I see.');
    g.setRelation('rose', 'patrol', true);
    g.setRelation('rose', 'player', true);
    const ai = new AIPilot(g, 0.85);
    ai.tactic = 'flanker';
    baron.ai = ai;
    await g.say('okafor', 'Interdictors, engage!');
    const buds = spawnRosebuds(g, baron.pos.clone().add(v(0, 100, 300)), beacon);
    await g.say('petal', 'Baron! It is a trap! Hold on, we are coming!');
    g.setMusicIntensity(1);
    await g.until(() => {
      g.objective = 'Bring down the Scarlet Baron';
      return frac(baron) < 0.4 || !baron.alive;
    });
    baron.invulnerable = true;
    await g.say('baron', 'No honour among contractors, it seems. I shall remember your colours, Rook. Rosebuds, we are leaving.');
    sweep(g, [baron, ...buds]);
    await g.say('okafor', 'He slipped the net. The Patrol still pays for the trouble, contractor.');
    void patrol;
    g.bonusPay = 10000;
    g.missionFlags.baron2 = 'trapped';
  }
  g.objective = '';
  await g.wait(1);
  g.endMission('victory');
}

// =============================================================================================

/** The Combine treasury barge. */
const BARGE: ShipClass = { ...SHIP_CLASSES.container, civilian: false, name: 'Gilded Cage', shields: 1500, shieldRegen: 0, hull: 5000, maxSpeed: 34, boostSpeed: 34 };

/** Part 3, "The Gilded Cage" (near Bastion): the Baron's heist on a Combine treasury barge. */
export async function runBaronHeist(g: Game, c: Campaign): Promise<void> {
  const player = g.player as Ship;
  const enemy = c.flags.baron2 === 'trapped';
  g.setRelation('rose', 'player', enemy);
  g.setRelation('rose', 'combine', true);
  g.setRelation('combine', 'player', false);
  const route = [v(-1800, 480, -2000), v(0, 450, -2200), v(1800, 420, -1900), v(3000, 400, -1500)];
  const barge = g.spawnShip(BARGE, 'combine', 'Gilded Cage', v(-2600, 500, -1900), route[0], { speed: 0 });
  const rp = new RoutePilot(route, 0.55, 150);
  barge.ai = rp;
  const escorts = [0, 1, 2, 3].map((i) =>
    g.spawnShip('sabre', 'combine', 'Cage escort', barge.pos.clone().add(v(i * 60 - 90, 50, 80)), route[0], { skill: 0.6, playerBias: 0.3, tactic: 'standoff' }),
  );
  barge.damageScale = 0.5;
  player.placeAt(barge.pos.clone().add(v(200, 120, 300)), route[0], 40);
  g.setMusicIntensity(0.3);
  g.objective = enemy ? 'Escort the treasury barge Gilded Cage' : 'Meet the Baron';

  if (enemy) {
    await g.say('strand', 'Pilot, Imelda Strand again. The Treasury asked me to recommend an escort with experience of the Scarlet Baron. I recommended you. Do not make me regret it.');
    await g.until(() => rp.progress >= 0.25);
    const baron = spawnBaron(g, barge.pos.clone().add(v(500, 150, -400)), barge.pos);
    const buds = spawnRosebuds(g, barge.pos.clone().add(v(600, 100, -300)), barge.pos);
    await g.say('baron', 'Rook. We have unfinished business, you and I. Rosebuds, the barge is ours. The contractor is mine.');
    await g.say('petal', 'You set a trap for him. We remember.');
    g.setMusicIntensity(1);
    baron.damageScale = 0.5;
    await g.until(() => {
      g.objective = 'Protect the Gilded Cage from the Baron';
      return frac(baron) < 0.4 || !barge.alive || frac(barge) < 0.2;
    });
    baron.invulnerable = true;
    if (frac(barge) < 0.2 || !barge.alive) await g.say('baron', 'The vault is ours. Not so pleased with yourself now, Rook? Come to the Rookery if you want it back. Let us end this properly.');
    else await g.say('baron', 'This is not finished. Come to the Rookery, Rook, if you dare. Let us end this properly.');
    sweep(g, [baron, ...buds]);
    g.missionFlags.baron3 = 'enemy';
  } else {
    if (c.flags.baron2 === 'downed') await g.say('baron', 'Rook! You will be pleased to hear that no Patrol cell holds a Delacourt for long. No hard feelings. You beat me fairly, and I am a great admirer of fairness, in others.');
    else await g.say('baron', 'Rook, my friend. You spared my life, so I thought I would make it worth the sparing.');
    await g.say('baron', 'That barge is the Gilded Cage, carrying the Reach\'s taxes home to people who never earned them. Ride with me and half the vault is yours.');
    await g.say('petal', 'He means it. He always splits fair. It is very annoying.');
    await g.until(() => rp.progress >= 0.25);
    const baron = spawnBaron(g, barge.pos.clone().add(v(500, 150, -400)), barge.pos);
    const buds = spawnRosebuds(g, barge.pos.clone().add(v(600, 100, -300)), barge.pos);
    baron.damageScale = 0.5;
    for (const s of [baron, ...buds]) if (s.ai instanceof AIPilot) s.ai.playerBias = 0;
    await g.say('baron', 'Gilded Cage, good morning! The Scarlet Baron, here to lighten your load.');
    g.setMusicIntensity(0.9);
    g.hint('Fire on the escorts to ride with the Baron, or on the Rosebuds to stop him', 9);
    let side: 'joined' | 'betrayed' | null = null;
    g.resetFriendlyFire(60);
    g.onBetrayal = (f) => {
      if (!side) side = f === 'combine' ? 'joined' : f === 'rose' ? 'betrayed' : side;
    };
    const decideBy = g.missionTime + 50;
    await g.until(() => {
      g.objective = 'The heist is on · fire on the escorts or on the Rosebuds';
      return side !== null || g.missionTime > decideBy;
    });
    g.resetFriendlyFire(100000);
    if (side === 'betrayed') {
      g.setRelation('rose', 'player', true);
      for (const s of [baron, ...buds]) if (s.ai instanceof AIPilot) s.ai.playerBias = 0.8;
      await g.say('baron', 'Et tu, Rook? Oh, that does sting.');
      await g.say('petal', 'I told him. I told him you looked like the honest sort.');
      await g.until(() => {
        g.objective = 'Stop the Baron';
        return frac(baron) < 0.4;
      });
      baron.invulnerable = true;
      await g.say('baron', 'Then it seems we must finish this at the Rookery. I shall keep a light on for you.');
      sweep(g, [baron, ...buds]);
      g.bonusPay = 12000;
      g.missionFlags.baron3 = 'betrayed';
    } else {
      if (side === 'joined') {
        g.setRelation('combine', 'player', true);
        await g.say('baron', 'That is the spirit! Rosebuds, the escorts. Rook, take the guns off that barge.');
      } else {
        await g.say('baron', 'Watching from the gallery, Rook? Very well. We shall do the work, and you shall have the view.');
      }
      await g.until(() => {
        g.objective = `Take the Gilded Cage · ${alive(escorts)} escorts left`;
        return alive(escorts) === 0 || frac(barge) < 0.35;
      });
      rp.hold = true;
      barge.invulnerable = true;
      await g.say('petal', 'She is dead in space. Opening the vault.');
      await g.wait(8);
      await g.say('baron', side === 'joined' ? 'Rook, you are a natural. Half the vault, as promised. Come and see the Rookery some time. Bring an appetite.' : 'Not a shot fired, and still you get a share. Call it a fee for the pleasure of your company.');
      sweep(g, [baron, ...buds]);
      g.bonusPay = side === 'joined' ? 25000 : 8000;
      g.missionFlags.baron3 = side === 'joined' ? 'joined' : 'stood';
    }
  }
  g.objective = '';
  await g.wait(1);
  g.endMission('victory');
}

// =============================================================================================

/** Part 4, "Last Dance" (the Rookery): defend his home beside him, or hunt him down in it. */
export async function runBaronFinale(g: Game, c: Campaign): Promise<void> {
  const player = g.player as Ship;
  const R = (k: string) => g.points[`rookery.${k}`];
  const friend = c.flags.baron3 === 'joined' || c.flags.baron3 === 'stood';
  player.placeAt(v(0, 180, 1700), R('center'), 80);
  g.setMusicIntensity(0.35);

  if (friend) {
    g.setRelation('rose', 'player', false);
    const guns = [0, 1, 2, 3].map((i) => g.spawnShip('turret', 'rose', 'Rookery gun', R(`gun${i}`).clone(), R(`gun${i}`).clone().multiplyScalar(2), { turret: true, skill: 0.5, playerBias: 0 }));
    void guns;
    const baron = spawnBaron(g, R('center').clone().add(v(80, 120, 500)), v(0, 150, 2000), false);
    const buds = spawnRosebuds(g, R('center').clone().add(v(-80, 100, 520)), v(0, 150, 2000));
    for (const s of [baron, ...buds]) {
      s.damageScale = 0.4;
      if (s.ai instanceof AIPilot) s.ai.playerBias = 0;
    }
    g.objective = 'Visit the Rookery';
    await g.say('baron', 'Rook! Welcome to the Rookery. Mind the lanterns, they are older than I am. Petal has made tea, which I strongly advise against.');
    await g.say('petal', 'Rude.');
    await g.wait(2);
    await g.say('vey', 'Delacourt. You turned down the Wake one time too many. Today I take your little chapel apart, and your pretty red ships with it.');
    await g.say('baron', 'Kaspar! I wondered when you would come. Rook, I hate to impose on a guest, but would you mind terribly?');
    g.setMusicIntensity(1);
    const waves: Parameters<typeof wave>[1][] = [
      { cutters: 5, drones: 6 },
      { fangs: 3, cutters: 3 },
      { fangs: 2, drones: 6, brute: 'Wake gunship "Maw"' },
    ];
    function wave(at: THREE.Vector3, mix: { cutters?: number; fangs?: number; drones?: number; brute?: string }): Ship[] {
      const out: Ship[] = [];
      let k = 0;
      const spot = () => at.clone().add(v((k % 4) * 45 - 70, (k++ % 3) * 25, Math.floor(k / 4) * 40));
      for (let i = 0; i < (mix.cutters ?? 0); i++) out.push(g.jumpIn('raider', 'wake', 'Wake Cutter', spot(), R('center'), { skill: 0.5, playerBias: 0.5, flares: 2 }));
      for (let i = 0; i < (mix.fangs ?? 0); i++) out.push(g.jumpIn('fang', 'wake', 'Wake Fang', spot(), R('center'), { skill: 0.6, playerBias: 0.5, flares: 2 }));
      for (let i = 0; i < (mix.drones ?? 0); i++) out.push(g.jumpIn('drone', 'wake', 'Wake drone', spot(), R('center'), { skill: 0.45, playerBias: 0.3 }));
      if (mix.brute) out.push(g.jumpIn('brute', 'wake', mix.brute, at.clone().add(v(0, -60, -120)), R('center'), { skill: 0.55, playerBias: 0.4 }));
      return out;
    }
    const spots = [v(900, 200, -600), v(-900, 100, 400), v(200, 300, -1100)];
    for (let w = 0; w < waves.length; w++) {
      const ships = wave(spots[w], waves[w]);
      if (w === 1) void g.say('petal', 'Fangs! Baron, they brought Fangs!').catch(() => undefined);
      if (w === 2) void g.say('baron', 'And there is Kaspar\'s pride and joy. Shall we, Rook? Together, on three.').catch(() => undefined);
      await g.until(() => {
        g.objective = `Defend the Rookery · wave ${w + 1} of 3 · ${alive(ships)} left`;
        return alive(ships) === 0;
      });
      sweep(g, ships);
      await g.wait(2);
    }
    g.objective = '';
    g.setMusicIntensity(0.3);
    await g.say('vey', 'This is not over, Delacourt.');
    await g.say('baron', 'It never is, Kaspar. That is what makes it fun.');
    await g.say('baron', 'Rook. Every ace deserves a worthy machine, and I happen to have a spare. She is in your hangar now. Paint a rose on her for me, would you?');
    await g.say('petal', 'He has never given anyone a ship. Not even me. I am not jealous. I am a little jealous.');
    g.missionFlags.baron = 'friend';
    g.missionFlags.gift = 'scarlet';
  } else {
    g.setRelation('rose', 'player', true);
    g.setRelation('rose', 'patrol', true);
    const patrol = [0, 1, 2].map((i) =>
      g.spawnShip('interdictor', 'patrol', i === 0 ? 'Sgt. Okafor' : `Interdictor ${i + 4}`, v(-80 + i * 60, 200, 1750), R('center'), { skill: 0.65, playerBias: 0, damageScale: 0.5 }),
    );
    const guns = [0, 1, 2, 3].map((i) => g.spawnShip('turret', 'rose', 'Rookery gun', R(`gun${i}`).clone(), R(`gun${i}`).clone().multiplyScalar(2), { turret: true, skill: 0.5, playerBias: 0.5 }));
    const buds = spawnRosebuds(g, R('center').clone().add(v(-80, 100, 520)), player.pos);
    const baron = spawnBaron(g, R('center').clone().add(v(80, 160, 300)), player.pos, false);
    baron.invulnerable = true;
    baron.ai = null;
    await g.say('okafor', 'There it is. The Rookery. Contractor, his guns and his wing first, then the Baron.');
    await g.say('baron', 'Rook. You came. I did keep a light on for you.');
    await g.say('petal', 'Rosebuds, defend the house!');
    g.setMusicIntensity(1);
    await g.until(() => {
      g.objective = `Break the Rookery's defences · ${alive(guns)} guns · ${alive(buds)} Rosebuds`;
      return alive(guns) + alive(buds) === 0;
    });
    baron.invulnerable = false;
    baron.damageScale = 0.6;
    const ai = new AIPilot(g, 0.9);
    ai.tactic = 'flanker';
    ai.playerBias = 1;
    baron.ai = ai;
    // the Patrol leaves the last dance to you
    g.setRelation('rose', 'patrol', false);
    for (const s of patrol) s.target = null;
    await g.say('okafor', 'He is yours, contractor. We hold the perimeter.');
    await g.say('baron', 'Just the two of us, then. As it should have been from the start. En garde, Rook.');
    await g.until(() => {
      g.objective = 'The Scarlet Baron';
      return frac(baron) < 0.25;
    });
    stand(baron);
    g.setMusicIntensity(0.3);
    await g.say('baron', 'There. You have me. Well, Rook? Do finish what you came for, or let an old man go and find a sky with better company.');
    g.objective = 'Hold your fire to let him go, or finish it';
    const outcome = await yieldMoment(g, baron, 14, false);
    g.objective = '';
    if (outcome === 'spared') {
      await g.say('baron', 'Adieu, Rook. It was, all things considered, a magnificent morning.');
      g.jumpOut(baron);
      await g.say('okafor', 'You let him go. Not my call to make, and I did not see a thing.');
      g.missionFlags.baron = 'exiled';
    } else {
      await g.say('baron', 'Tell them the Baron flew well, Rook. Tell them it was a good morning.');
      await g.say('petal', 'Baron? Baron!');
      await g.say('okafor', 'No pod. He is gone, contractor. The bounty is yours.');
      g.bonusPay = 40000;
      g.missionFlags.baron = 'dead';
    }
  }
  await g.wait(1);
  g.endMission('victory');
}

