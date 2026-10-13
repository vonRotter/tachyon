import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

const alive = (ships: Ship[]): number => ships.filter((s) => s.alive).length;

/** Spawns a raider wing at a jump point `dist` metres from the station, in a loose wedge. */
function raiderWave(
  g: Game,
  count: number,
  bearing: number,
  elevation: number,
  skill: [number, number],
  missiles: number,
  names: string[],
  fangs = 0,
): Ship[] {
  const dist = 1700;
  const dir = v(Math.cos(bearing) * Math.cos(elevation), Math.sin(elevation), Math.sin(bearing) * Math.cos(elevation));
  const center = dir.clone().multiplyScalar(dist);
  const side = new THREE.Vector3().crossVectors(dir, v(0, 1, 0)).normalize();
  const ships: Ship[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.ceil(i / 2);
    const s = i % 2 === 0 ? 1 : -1;
    const p = center
      .clone()
      .addScaledVector(side, s * row * 45)
      .addScaledVector(dir, row * 40)
      .add(v(0, (i % 3) * 15 - 15, 0));
    // the first few are Fangs: the Wake's better fighter, fast with short heavy guns
    const fang = i < fangs;
    const ship = g.jumpIn(fang ? 'fang' : 'raider', 'wake', fang ? 'Wake Fang' : names[i % names.length], p, v(0, 0, 0), {
      skill: skill[0] + (skill[1] - skill[0]) * Math.random(),
      playerBias: 0.55,
    });
    ship.missiles = i < missiles ? 3 : 0;
    ship.flares = i < missiles ? 2 : 0;
    ships.push(ship);
  }
  return ships;
}

/**
 * "Cold Guns": the vertical-slice mission at Kestrel Station. Checkpoints are the numbered
 * stages; retrying after death resumes at the last one reached.
 */
export async function runKestrelMission(g: Game, checkpoint: number): Promise<void> {
  const hub = g.points['station.hub'];
  const pad = () => g.input.device === 'gamepad';
  const key = (a: Parameters<typeof g.input.label>[0]) => g.input.label(a);
  const allies = [
    g.spawnShip('warden', 'kestrel', 'Juno', v(-140, 90, 380), hub, { skill: 0.7, playerBias: 0, damageScale: 0.45 }),
    g.spawnShip('warden', 'kestrel', 'Pike', v(-190, 50, 430), hub, { skill: 0.6, playerBias: 0, damageScale: 0.5 }),
  ];
  const [juno, pike] = allies;
  let firstKill = true;
  g.onKill((ship, by) => {
    if (ship === juno && pike.alive) void g.say('pike', "Juno's down! She punched out. I saw the pod. Keep fighting, Rook!");
    else if (ship === pike && juno.alive) void g.say('juno', 'Pike! Damn it. Rook, it is you and me now.');
    else if (ship.faction === 'wake' && by?.isPlayer && firstKill) {
      firstKill = false;
      void g.say('juno', 'Splash one! Nice shooting, mercenary.');
    }
  });

  if (checkpoint === 0) {
    g.setMusicIntensity(0.2);
    g.objective = 'Hold position near Kestrel Station';
    await g.wait(1.2);
    g.hint(
      pad()
        ? 'Right stick: steer · Left stick: roll & throttle · A: boost · RT: fire'
        : `${g.input.settings.mouseMode === 'aim' ? 'Mouse: aim, the ship flies to the circle' : 'Mouse: steer'} · ${key('throttleUp')}/${key('throttleDown')}: throttle · ${key('rollLeft')}/${key('rollRight')}: roll · ${key('boost')}: boost · ${key('fire')}: fire · Esc: options`,
      9,
    );
    await g.say('varga', 'Rook, Kestrel Control. Good to see you flying again after the Ashfall. First sortie in the new ship, so take it easy out there.');
    await g.say('juno', 'Juno here. I towed you in, so I have a stake in you. Stay near the hub.');
    await g.say('varga', "Your docking slot got bumped, too. A Combine carrier came in unannounced and took the whole east cradle. Hold near the hub, and please don't scratch my paint.");
    g.hint(
      pad()
        ? 'Hold LT to SLIDE: keep your momentum and turn to aim anywhere'
        : `Hold ${key('slide').toUpperCase()} to SLIDE: keep your momentum and turn to aim anywhere`,
      8,
    );
    await g.wait(4);
    await g.say('varga', 'Wait. Jump signatures, bearing two-seven-zero. Multiple contacts. Those are Red Wake transponders.');
  }

  if (checkpoint <= 1) {
    g.checkpoint = 1;
    g.setMusicIntensity(0.6);
    const w1 = raiderWave(g, 4, Math.PI * 1.05, 0.12, [0.3, 0.45], 0, ['Wake Cutter', 'Wake Cutter', 'Wake Cutter', 'Wake Cutter']);
    await g.say('vey', "Kestrel Station! Nobody needs to die today. You're holding cargo that belongs to the Wake. Bay Four. Open it.");
    await g.say('varga', 'Militia, scramble! Rook, you want that docking slot? Earn it.');
    g.objective = 'Destroy the Red Wake raiders';
    g.hint(
      pad()
        ? 'Y: target nearest · LB: next target · Aim at the yellow diamond to lead your shots'
        : `${key('targetNearest')}: target nearest · ${key('targetNext')}: next target · Aim at the yellow diamond to lead your shots`,
      8,
    );
    await g.say('tessaine', 'Kestrel, Sovereign Dawn. We are observing. Do carry on.');
    await g.say('sorrel', 'A Combine carrier parks beside a Drift cargo hold, and an hour later the Wake jumps in. Funny timing, Commander.');
    await g.until(() => alive(w1) === 0);
    g.objective = '';
    await g.wait(1.5);
  }

  if (checkpoint <= 2) {
    g.checkpoint = 2;
    await g.say('vey', 'Cute. Second wing, go loud.');
    const w2 = raiderWave(g, 5, Math.PI * 0.35, -0.2, [0.45, 0.6], 3, ['Wake Hunter', 'Wake Hunter', 'Wake Hunter', 'Wake Cutter', 'Wake Cutter'], 1);
    g.objective = 'Destroy the second Red Wake wing';
    await g.say('juno', "More of them, and these ones are carrying missiles. If one locks on, drag it through the towers. Missiles can't take corners like you can.");
    g.hint(
      pad()
        ? 'Hold on a target to lock missiles · RB: fire missile'
        : `Keep a target in your sights to lock · ${key('missile')}: fire missile`,
      7,
    );
    await g.say('varga', 'Sovereign Dawn, Kestrel. We could use those guns of yours right now.');
    await g.say('tessaine', 'Regrettably our batteries are cold for maintenance, Kestrel. We cannot assist.');
    await g.say('sorrel', 'Maintenance. Are you listening to this, Varga?');
    await g.until(() => alive(w2) === 0);
    g.objective = '';
    await g.wait(1.5);
  }

  if (checkpoint <= 3) {
    g.checkpoint = 3;
    g.setMusicIntensity(0.9);
    await g.say('vey', 'That pilot again? The one we left drifting in the Ashfall? Fine. Mawbreaker, finish what you started.');
    const brute = g.jumpIn('brute', 'wake', 'Mawbreaker', v(-900, -300, -1300), hub, { skill: 0.6, playerBias: 0.4 });
    const escorts = raiderWave(g, 3, Math.PI * 1.35, -0.15, [0.55, 0.7], 2, ['Wake Hunter'], 1);
    g.objective = 'Destroy the gunship Mawbreaker';
    await g.say('varga', 'That is a gunship! Rook, Juno, Pike. Stop it before it reaches the station!');
    await g.say('juno', 'That is the one that hit your caravan, Rook. Want to settle it?');
    g.hint('Gunship turrets track you. Stay on its tail, use the station for cover', 7);
    await g.until(() => !brute.alive);
    g.objective = '';
    g.setMusicIntensity(0.3);
    await g.say('vey', "This isn't over, Kestrel. Ask your Combine friends who sold us your patrol schedule.");
    g.retreat(escorts);
    await g.wait(1.5);
    await g.say('tessaine', 'Impressive flying, Rook. The Combine pays well for talent, and better for discretion. Dock with the Sovereign Dawn. We should talk.');
    await g.say('sorrel', 'Rook. Before you go to them, come see me. I am aboard Kestrel, bay one. Ask yourself why a Combine battlecruiser went quiet the moment the Wake arrived.');
    await g.say('varga', "Your slot's open, Rook. Bay one is ours, the Dawn's hangar is theirs. Choose carefully. Out here, choices stick.");
    // the choice is where you land
    g.objective = 'Choose your side: dock at Kestrel bay 1 (Drift Union) or the Sovereign Dawn (Helion Combine)';
    g.hint(
      pad()
        ? 'Fly to either dock and press X for clearance. Where you land is your answer'
        : `Fly to either dock and press ${key('dock')} for clearance. Where you land is your answer`,
      9,
    );
    const port = await g.dock(['kestrel.bay1', 'carrier.hangar']);
    g.objective = '';
    if (port === 'carrier.hangar') {
      g.missionFlags.allegiance = 'combine';
      await g.say('quell', 'Welcome aboard the Sovereign Dawn, Rook. The Commander will see you now.');
    } else {
      g.missionFlags.allegiance = 'drift';
      await g.say('sorrel', 'You came. Sit down, Rook. Let me tell you about that battlecruiser.');
    }
    await g.wait(0.5);
    g.endMission('victory');
  }
}
