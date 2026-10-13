import type { Game } from './game';
import type { Campaign, Side } from './loadout';
import { runKestrelMission } from './mission';
import { runLaunchOrder } from './missionLaunchOrder';
import { runFlotsam } from './missionFlotsam';
import { runAccord } from './missionAccord';
import { runOpenChannel } from './missionOpenChannel';
import { runBastion, runLastLight } from './missionFinale';

export interface MissionDef {
  id: string;
  name: string;
  /** Display name of where it happens. */
  location: string;
  /** Location id to build (see world/locations.ts). */
  map: string;
  /** Hangar text; may depend on the campaign (which side you are on). */
  briefing: string | ((c: Campaign) => string);
  /** Pay on completion, before bounties. */
  pay: number;
  run: (g: Game, checkpoint: number, c: Campaign) => Promise<void>;
  /** Whether the mission shows up in the hangar. */
  available: (c: Campaign) => boolean;
  /** Debrief headline on victory. */
  victoryTitle: string;
  /** Whose contract it is: completing it earns standing with them ('current': whoever you fly for). */
  faction?: Side | 'current';
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
  {
    id: 'open-channel',
    name: 'Open Channel',
    location: 'Vantage Station',
    map: 'vantage',
    briefing: (c) =>
      c.allegiance === 'combine'
        ? 'The Drift mean to broadcast stolen Combine records from Vantage, a research station with the only dish array that reaches every station in the Reach. Silence its three transmitters before the upload completes.'
        : 'Mother Sorrel is broadcasting the Combine\'s transfer records from Vantage, a research station with the only dish array that reaches every station in the Reach. Hold off the Combine until the upload completes.',
    pay: 16000,
    run: (g, cp, c) => runOpenChannel(g, cp, c.allegiance === 'combine' ? 'combine' : 'drift'),
    faction: 'current',
    available: (c) => (c.allegiance === 'combine' || c.allegiance === 'drift') && ((c.completed['launch-order'] ?? 0) > 0 || (c.completed.flotsam ?? 0) > 0),
    victoryTitle: 'Open Channel',
  },
  {
    id: 'accord',
    name: 'The Accord',
    location: 'Kestrel Station',
    map: 'kestrel',
    briefing: (c) =>
      c.allegiance === 'combine'
        ? 'The Combine and the Drift sign a ceasefire aboard Kestrel today. Commander Tessaine wants you on the escort for the Combine delegation. A quiet run, and a historic one.'
        : 'The Drift and the Combine sign a ceasefire aboard Kestrel today. Mother Sorrel is sending a gift to the Sovereign Dawn, and wants you to see the Magpie\'s hauler safely in.',
    pay: 20000,
    run: (g, cp, c) => runAccord(g, cp, c.allegiance === 'combine' ? 'combine' : 'drift'),
    faction: 'current',
    available: (c) => (c.allegiance === 'combine' || c.allegiance === 'drift') && (c.completed['open-channel'] ?? 0) > 0,
    victoryTitle: 'The Accord',
  },
  {
    id: 'last-light',
    name: 'Last Light',
    location: 'Haven',
    map: 'haven',
    briefing:
      'The Drift have pulled back to Haven, their home, behind the Long Patience. The Sovereign Dawn and the destroyer Resolute go in today. Break the Drift screen and silence the battlecruiser\'s guns, and Mother Sorrel will have to come to the table. Finale of the Combine campaign.',
    pay: 30000,
    run: runLastLight,
    faction: 'combine',
    available: (c) => c.allegiance === 'combine' && (c.completed.accord ?? 0) > 0,
    victoryTitle: 'The Reach under the Combine',
  },
  {
    id: 'bastion',
    name: 'The Bastion',
    location: 'Bastion',
    map: 'bastion',
    briefing:
      'The Combine runs the Reach from Bastion, a fortress behind a shield fed by four pylons. Mother Sorrel is taking the Long Patience there. Bring down the pylons, silence the batteries, and the Combine leaves the Reach. Finale of the Drift campaign.',
    pay: 30000,
    run: runBastion,
    faction: 'drift',
    available: (c) => c.allegiance === 'drift' && (c.completed.accord ?? 0) > 0,
    victoryTitle: 'The Combine leaves the Reach',
  },
];

export const briefingText = (m: MissionDef, c: Campaign): string => (typeof m.briefing === 'string' ? m.briefing : m.briefing(c));

export const missionById = (id: string): MissionDef => MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];

/** The story in order for each side; the hangar shows where you are in it. */
export const CAMPAIGN_PATHS: Record<'combine' | 'drift' | 'none', string[]> = {
  none: ['cold-guns'],
  combine: ['cold-guns', 'launch-order', 'open-channel', 'accord', 'last-light'],
  drift: ['cold-guns', 'flotsam', 'open-channel', 'accord', 'bastion'],
};

export function campaignPath(c: Campaign): string[] {
  return CAMPAIGN_PATHS[c.allegiance === 'combine' || c.allegiance === 'drift' ? c.allegiance : 'none'];
}

/** The next story contract you have not flown, if any. */
export function nextStory(c: Campaign): MissionDef | null {
  for (const id of campaignPath(c)) {
    const m = MISSIONS.find((x) => x.id === id);
    if (m && m.available(c) && !c.completed[id]) return m;
  }
  return null;
}
