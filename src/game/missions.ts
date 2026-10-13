import type { Game } from './game';
import type { Campaign } from './loadout';
import { runKestrelMission } from './mission';
import { runLaunchOrder } from './missionLaunchOrder';

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
    available: (c) => c.allegiance === 'combine' && (c.completed['cold-guns'] ?? 0) > 0,
    victoryTitle: 'The Gallows falls',
  },
];

export const missionById = (id: string): MissionDef => MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
