import type { Game } from './game';
import type { Campaign } from './loadout';
import { runKestrelMission } from './mission';

export interface MissionDef {
  id: string;
  name: string;
  location: string;
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
    briefing:
      'Your docking slot at Kestrel has been bumped by an unannounced Helion Combine carrier. Hold near the hub and wait for clearance. Should be quiet.',
    pay: 8000,
    run: runKestrelMission,
    available: () => true,
    victoryTitle: 'Kestrel Station holds',
  },
];

export const missionById = (id: string): MissionDef => MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
