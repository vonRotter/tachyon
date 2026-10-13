import type { Game } from './game';
import type { Campaign, Side } from './loadout';
import { runKestrelMission } from './mission';
import { runLaunchOrder } from './missionLaunchOrder';
import { runFlotsam } from './missionFlotsam';

export interface MissionDef {
  id: string;
  name: string;
  /** Display name of where it happens. */
  location: string;
  /** Location id to build (see world/locations.ts). */
  map: string;
  briefing: string;
  /** Pay on completion, before bounties. */
  pay: number;
  run: (g: Game, checkpoint: number) => Promise<void>;
  /** Whether the mission shows up in the hangar. */
  available: (c: Campaign) => boolean;
  /** Debrief headline on victory. */
  victoryTitle: string;
  /** Whose contract it is: completing it earns standing with them. */
  faction?: Side;
}

export const MISSIONS: MissionDef[] = [
  {
    id: 'cold-guns',
    name: 'Cold Guns',
    location: 'Kestrel Station',
    map: 'kestrel',
    briefing:
      'Your docking slot at Kestrel has been bumped by an unannounced Helion Combine carrier. Hold near the hub and wait for clearance. Should be quiet.',
    pay: 8000,
    run: runKestrelMission,
    available: () => true,
    victoryTitle: 'Kestrel Station holds',
  },
  {
    id: 'launch-order',
    name: 'Launch Order',
    location: 'The Gallows',
    map: 'gallows',
    briefing:
      'Commander Tessaine is taking the Sovereign Dawn to the Red Wake base at the Gallows, and wants you on the strike. Launch with Lance and Sabre flights, silence the turrets and the comms mast.',
    pay: 22000,
    run: runLaunchOrder,
    faction: 'combine',
    available: (c) => c.allegiance === 'combine' && (c.completed['cold-guns'] ?? 0) > 0,
    victoryTitle: 'The Gallows falls',
  },
  {
    id: 'flotsam',
    name: 'Flotsam',
    location: 'The Ashfall',
    map: 'ashfall',
    briefing:
      'Mother Sorrel needs the Combine\'s transfer records, kept aboard the carrier Meridian. Drift in with the wreckage, slip onto her recovery deck, grab the package, then run for the Long Patience. You will be outgunned and outnumbered. Fly.',
    pay: 18000,
    run: runFlotsam,
    faction: 'drift',
    available: (c) => c.allegiance === 'drift' && (c.completed['cold-guns'] ?? 0) > 0,
    victoryTitle: 'The records are out',
  },
];

export const missionById = (id: string): MissionDef => MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
