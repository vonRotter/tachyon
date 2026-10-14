import type { Game } from './game';
import { SIDE_PER_CHAPTER, type Campaign, type Side } from './loadout';
import { runKestrelMission } from './mission';
import { runLaunchOrder } from './missionLaunchOrder';
import { runFlotsam } from './missionFlotsam';
import { runAccord } from './missionAccord';
import { runOpenChannel } from './missionOpenChannel';
import { runBastion, runLastLight } from './missionFinale';
import { runBounty, runConvoy, runOreGuard } from './missionJobs';
import { runCourier, runRescue, runSalvage } from './missionCivil';
import { runPrologue } from './missionPrologue';
import { runCredentials, runKeys, runLantern, runLooseEnds, runSealedOrders } from './missionCampaign';
import { runFreePort } from './missionFreePort';
import { runBaronDuel, runBaronFinale, runBaronHeist, runBaronRobbery } from './missionBaron';

export interface MissionDef {
  id: string;
  name: string;
  /** Display name of where it happens (may depend on your side). */
  location: string | ((c: Campaign) => string);
  /** Location id to build (see world/locations.ts); may depend on your side. */
  map: string | ((c: Campaign) => string);
  /** Hangar text; may depend on the campaign (which side you are on). */
  briefing: string | ((c: Campaign) => string);
  /** Pay on completion, before bounties. */
  pay: number;
  run: (g: Game, checkpoint: number, c: Campaign) => Promise<void>;
  /** Whether the mission shows up in the hangar. */
  available: (c: Campaign) => boolean;
  /** Debrief headline on victory. */
  victoryTitle: string;
  /** Side job: pays in full every time and is not part of the story. */
  repeatable?: boolean;
  /** Hangar grouping. */
  kind?: 'story' | 'baron' | 'job';
  /** Whose contract it is: completing it earns standing with them ('current': whoever you fly for). */
  faction?: Side | 'current';
}

const sideOf = (c: Campaign): 'combine' | 'drift' => (c.allegiance === 'combine' ? 'combine' : 'drift');
/** On your side's story path, with the chapter before it flown. */
const afterOnPath = (id: string) => (c: Campaign): boolean => {
  if (c.allegiance !== 'combine' && c.allegiance !== 'drift') return false;
  const path = CAMPAIGN_PATHS[c.allegiance];
  const i = path.indexOf(id);
  return i > 0 && (c.completed[path[i - 1]] ?? 0) > 0;
};

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
    available: afterOnPath('launch-order'),
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
    available: afterOnPath('flotsam'),
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
    available: afterOnPath('open-channel'),
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
    available: afterOnPath('accord'),
    victoryTitle: 'The Accord',
  },
  {
    id: 'credentials',
    name: 'Credentials',
    location: (c) => (c.allegiance === 'combine' ? 'Kestrel Station' : 'The Ashfall'),
    map: (c) => (c.allegiance === 'combine' ? 'kestrel' : 'ashfall'),
    briefing: (c) =>
      c.allegiance === 'combine'
        ? 'Lieutenant Vale wants to see how you fly before the Commander trusts you with anything sharp. Three relief transports for the Sovereign Dawn: food, medicine, water reclamation for Kestrel. If anyone asks to look inside, they do not.'
        : 'Kit has you on the ore run: three Drift haulers through the Ashfall to the Long Patience. Combine customs cutters are working the Ashfall this week. Nobody looks in the Magpie\'s hold.',
    pay: 12000,
    run: (g, _cp, c) => runCredentials(g, sideOf(c)),
    faction: 'current',
    available: afterOnPath('credentials'),
    victoryTitle: 'Trusted, for now',
  },
  {
    id: 'loose-ends',
    name: 'Loose Ends',
    location: 'The Ashfall',
    map: 'ashfall',
    briefing: (c) =>
      c.allegiance === 'combine'
        ? 'One Red Wake ship escaped the Gallows with a copy of what Vey was shouting about, and it is running for a Drift frigate in the Ashfall. Commander Tessaine wants it destroyed. Not captured: destroyed.'
        : 'Vey kept a second copy of the Combine\'s transfer records and is sending it to the Drift. His courier is running for the frigate Lark through the Ashfall with Combine hunters behind it. Keep it alive.',
    pay: 18000,
    run: (g, _cp, c) => runLooseEnds(g, sideOf(c)),
    faction: 'current',
    available: afterOnPath('loose-ends'),
    victoryTitle: 'Loose ends',
  },
  {
    id: 'free-port',
    name: 'Free Port',
    location: 'Saltmarket',
    map: 'saltmarket',
    briefing: (c) =>
      c.allegiance === 'combine'
        ? 'Commander Tessaine has a sealed case for the Combine trade office at Saltmarket, the free port. Land it in bay 18 and come home. The Reach Patrol keeps the peace there: mind the speed limit in the lanes, and keep your guns cold.'
        : 'Mother Sorrel is sending a crate of fever vaccine to the clinic at Saltmarket, the free port. Land it in bay 18. The Reach Patrol keeps the peace there: mind the speed limit in the lanes, and keep your guns cold.',
    pay: 20000,
    run: (g, cp, c) => runFreePort(g, cp, sideOf(c)),
    faction: 'current',
    available: afterOnPath('free-port'),
    victoryTitle: 'Saltmarket holds',
  },
  {
    id: 'sealed-orders',
    name: 'Sealed Orders',
    location: (c) => (c.allegiance === 'combine' ? 'Bastion' : 'Haven'),
    map: (c) => (c.allegiance === 'combine' ? 'bastion' : 'haven'),
    briefing: (c) =>
      c.allegiance === 'combine'
        ? 'Commander Tessaine has sealed orders for you, and they are not for the radio. Report to Bastion in person.'
        : 'Mother Sorrel wants to see you at Haven. She says there is something she has to tell you face to face.',
    pay: 20000,
    run: (g, _cp, c) => runSealedOrders(g, sideOf(c), c),
    faction: 'current',
    available: afterOnPath('sealed-orders'),
    victoryTitle: 'Now you know',
  },
  {
    id: 'keys',
    name: 'Keys to the Door',
    location: 'Kestrel Station',
    map: 'kestrel',
    briefing: (c) =>
      c.allegiance === 'combine'
        ? 'Three relays guard Kestrel\'s approach. Plant a tap on each tonight, quietly, and tomorrow the station\'s guns will be blind when the delegation arrives. If the militia sees you, there is no Accord.'
        : 'The Magpie needs the Sovereign Dawn\'s hangar clearance codes. Sit beside three of her masts long enough for a little box to copy them, without her pickets noticing.',
    pay: 16000,
    run: (g, cp, c) => runKeys(g, sideOf(c), cp),
    faction: 'current',
    available: afterOnPath('keys'),
    victoryTitle: 'The door is open',
  },
  {
    id: 'lantern',
    name: 'Lantern',
    location: (c) => (c.allegiance === 'combine' ? 'Haven' : 'Bastion'),
    map: (c) => (c.allegiance === 'combine' ? 'haven' : 'bastion'),
    briefing: (c) =>
      c.allegiance === 'combine'
        ? 'A fleet cannot jump blind into Haven\'s rocks. Fly ahead, lay three jump beacons on the approach and hold them until the Sovereign Dawn and the Resolute lock on.'
        : 'The Long Patience cannot jump blind into Bastion\'s shadow. Fly ahead, lay three jump beacons on the approach and hold them until she locks on.',
    pay: 24000,
    run: (g, cp, c) => runLantern(g, sideOf(c), c, cp),
    faction: 'current',
    available: afterOnPath('lantern'),
    victoryTitle: 'The way is lit',
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
    available: afterOnPath('last-light'),
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
    available: afterOnPath('bastion'),
    victoryTitle: 'The Combine leaves the Reach',
  },
  {
    id: 'job-bounty',
    name: 'Side job: Patrol Bounty',
    location: 'The Ashfall',
    map: 'ashfall',
    briefing: 'The Reach Patrol has posted a bounty on a Red Wake raiding party hiding in the Ashfall. Fly with two Patrol Interdictors and collect per hull. Pays in full every time.',
    pay: 9000,
    run: (g) => runBounty(g),
    repeatable: true,
    kind: 'job',
    available: (c) => (c.completed['cold-guns'] ?? 0) > 0,
    victoryTitle: 'Bounties filed',
  },
  {
    id: 'job-convoy',
    name: 'Side job: Convoy Run',
    location: 'Vantage Station',
    map: 'vantage',
    briefing: 'Two container ships with spares for Vantage\'s array, and the Red Wake know they are coming. Bring them in through the rock ring. Bonus for every ship that arrives. Pays in full every time.',
    pay: 8000,
    run: (g) => runConvoy(g),
    repeatable: true,
    kind: 'job',
    available: (c) => (c.completed['cold-guns'] ?? 0) > 0,
    victoryTitle: 'Convoy in',
  },
  {
    id: 'job-ore',
    name: 'Side job: Ore Guard',
    location: 'Kestrel Station',
    map: 'kestrel',
    briefing: 'Wake strip-miners have been hitting Kestrel\'s ore barges in the rock field. Keep three crews alive through the raids. Bonus for every barge that makes it. Pays in full every time.',
    pay: 6000,
    run: (g) => runOreGuard(g),
    repeatable: true,
    kind: 'job',
    available: (c) => (c.completed['cold-guns'] ?? 0) > 0,
    victoryTitle: 'The crews are safe',
  },
  {
    id: 'baron-1',
    name: 'A Rose for the Lady',
    location: 'Vantage Station',
    map: 'vantage',
    briefing: 'Escort the Combine liner Aurelian Dawn past Vantage. Lady Imelda Strand is aboard with her late husband\'s art collection, and a certain gentleman pirate has been asking after it.',
    pay: 9000,
    run: (g) => runBaronRobbery(g),
    kind: 'baron',
    available: (c) => (c.completed['cold-guns'] ?? 0) > 0,
    victoryTitle: 'A rose for the lady',
  },
  {
    id: 'baron-2',
    name: 'Pistols at Dawn',
    location: 'The Ashfall',
    map: 'ashfall',
    briefing: 'A single red rose arrived at your hangar, with a card: the old destroyer in the Ashfall, one on one, guns only. The Reach Patrol has read the card too, and has its own idea.',
    pay: 8000,
    run: (g, _cp, c) => runBaronDuel(g, c),
    kind: 'baron',
    available: (c) => (c.completed['baron-1'] ?? 0) > 0,
    victoryTitle: 'Pistols at dawn',
  },
  {
    id: 'baron-3',
    name: 'The Gilded Cage',
    location: 'Bastion',
    map: 'bastion',
    briefing: (c) =>
      c.flags.baron2 === 'trapped'
        ? 'The Combine Treasury wants an escort for the barge Gilded Cage, carrying the Reach\'s taxes past Bastion. The Baron has not forgotten your trap.'
        : 'The Baron has a proposition: the Combine treasury barge Gilded Cage passes Bastion today, and he would love company. Half the vault, he says.',
    pay: 10000,
    run: (g, _cp, c) => runBaronHeist(g, c),
    kind: 'baron',
    available: (c) => (c.completed['baron-2'] ?? 0) > 0,
    victoryTitle: 'The Gilded Cage',
  },
  {
    id: 'baron-4',
    name: 'Last Dance',
    location: 'The Rookery',
    map: 'rookery',
    briefing: (c) =>
      c.flags.baron3 === 'joined' || c.flags.baron3 === 'stood'
        ? 'An invitation to the Rookery, the Baron\'s hideout in an ice field: a broken liner with a chapel on its back. Bring an appetite, the card says. Petal has added: do not drink the tea.'
        : 'The Reach Patrol has found the Rookery, the Baron\'s hideout in an ice field. Sergeant Okafor wants you along to finish it.',
    pay: 15000,
    run: (g, _cp, c) => runBaronFinale(g, c),
    kind: 'baron',
    available: (c) => (c.completed['baron-3'] ?? 0) > 0,
    victoryTitle: 'Last dance',
  },
  {
    id: 'civ-courier',
    name: 'Odd job: The Ring Run',
    location: 'Kestrel Station',
    map: 'kestrel',
    briefing: 'The dock crews\' monthly race round Kestrel: over and under the spinning habitat ring, through the rock field, and through the Combine battlecruiser\'s hangar tunnel. Three rivals. A small fee for starting; the purse is 6,000 for first, 3,000 for second, 1,500 for third.',
    pay: 1500,
    run: (g) => runCourier(g),
    repeatable: true,
    kind: 'job',
    available: (c) => (c.completed['cold-guns'] ?? 0) > 0,
    victoryTitle: 'Across the line',
  },
  {
    id: 'civ-rescue',
    name: 'Odd job: Mayday',
    location: 'The Ashfall',
    map: 'ashfall',
    briefing: 'A salvage tug blew its reactor in the Ashfall. Four escape pods are drifting in the wrecks, each with its own air supply. Hook them before it runs out and tow them to the Patrol transport. Pay per pod.',
    pay: 5000,
    run: (g) => runRescue(g),
    repeatable: true,
    kind: 'job',
    available: (c) => (c.completed['cold-guns'] ?? 0) > 0,
    victoryTitle: 'Pods recovered',
  },
  {
    id: 'civ-salvage',
    name: 'Odd job: Finders Keepers',
    location: 'Vantage Station',
    map: 'vantage',
    briefing: 'A lost freighter\'s cargo is drifting in Vantage\'s rock ring. Fly through the crates to grab them before Wake scavenger tugs carry them off. Small money, and the Wake bring escorts. Pay per crate.',
    pay: 1500,
    run: (g) => runSalvage(g),
    repeatable: true,
    kind: 'job',
    available: (c) => (c.completed['cold-guns'] ?? 0) > 0,
    victoryTitle: 'Salvage rights',
  },
  {
    // played once, before the first ship is bought; never listed in the hangar
    id: 'prologue',
    name: 'The Tamsin Run',
    location: 'The Ashfall',
    map: 'ashfall',
    briefing: 'Escort a small independent caravan through the edge of the Ashfall to Kestrel Station.',
    pay: 0,
    run: (g) => runPrologue(g),
    available: () => false,
    victoryTitle: 'Adrift',
    kind: 'story',
  },
];

export const briefingText = (m: MissionDef, c: Campaign): string => (typeof m.briefing === 'string' ? m.briefing : m.briefing(c));
export const mapOf = (m: MissionDef, c: Campaign): string => (typeof m.map === 'string' ? m.map : m.map(c));
export const locationOf = (m: MissionDef, c: Campaign): string => (typeof m.location === 'string' ? m.location : m.location(c));

export const missionById = (id: string): MissionDef => MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];

/** The story in order for each side; the hangar shows where you are in it. */
export const CAMPAIGN_PATHS: Record<'combine' | 'drift' | 'none', string[]> = {
  none: ['cold-guns'],
  combine: ['cold-guns', 'credentials', 'launch-order', 'loose-ends', 'free-port', 'open-channel', 'sealed-orders', 'keys', 'accord', 'lantern', 'last-light'],
  drift: ['cold-guns', 'credentials', 'flotsam', 'loose-ends', 'free-port', 'open-channel', 'sealed-orders', 'keys', 'accord', 'lantern', 'bastion'],
};

export function campaignPath(c: Campaign): string[] {
  return CAMPAIGN_PATHS[c.allegiance === 'combine' || c.allegiance === 'drift' ? c.allegiance : 'none'];
}

/** The last chapter of your side's story (the hangar and the mission start say so). */
export function isFinale(m: MissionDef, c: Campaign): boolean {
  const path = campaignPath(c);
  return path.length > 1 && path[path.length - 1] === m.id;
}

/** The next story contract you have not flown, if any. */
export function nextStory(c: Campaign): MissionDef | null {
  const path = campaignPath(c);
  // chapters before one you have already flown are behind you (older saves, or a change of side)
  let from = 0;
  for (let i = 0; i < path.length; i++) if (c.completed[path[i]]) from = i + 1;
  for (const id of path.slice(from)) {
    const m = MISSIONS.find((x) => x.id === id);
    if (m && !c.completed[id] && (m.available(c) || path.indexOf(id) === from)) return m;
  }
  return null;
}

/** Your side's finale has been flown: the story is over and the Reach is yours to fly about in. */
export function campaignOver(c: Campaign): boolean {
  const path = campaignPath(c);
  return path.length > 1 && (c.completed[path[path.length - 1]] ?? 0) > 0;
}

/** Side activities are odd jobs and the Baron's arc. */
export const isSide = (m: MissionDef): boolean => m.kind === 'job' || m.kind === 'baron';

/** True while a story chapter is waiting and this chapter's side work is used up. */
export function sideLocked(c: Campaign): boolean {
  return !c.unlimited && nextStory(c) !== null && (c.completed['cold-guns'] ?? 0) > 0 && c.sideDone >= SIDE_PER_CHAPTER;
}

/** Deals a fresh board of odd jobs: three at random from those open to you. */
export function dealBoard(c: Campaign): void {
  const pool = MISSIONS.filter((m) => m.kind === 'job' && m.available(c)).map((m) => m.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  c.board = pool.slice(0, 3);
}

/**
 * Whether a contract shows in the hangar: story and arc missions once only, odd jobs only while
 * they are on the board, and no side work once this chapter's share is used. Test mode shows all.
 */
export function offered(m: MissionDef, c: Campaign): boolean {
  if (c.unlimited) return m.id !== 'prologue';
  // the story offers exactly one chapter: the next one
  if ((m.kind ?? 'story') === 'story') return nextStory(c)?.id === m.id;
  if (!m.available(c)) return false;
  // after the finale every job is open, every time: no board, no chapter allowance
  if (m.kind === 'job') return campaignOver(c) || (c.board.includes(m.id) && !sideLocked(c));
  if (c.completed[m.id]) return false;
  if (isSide(m)) return !sideLocked(c);
  return true;
}
