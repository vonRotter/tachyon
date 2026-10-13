import { FACTIONS, type FactionId } from '../entities/factions';
import { SHIP_CLASSES, type ShipClass } from '../entities/shipClasses';
import { CAPITAL_INFO, type CapitalKind } from '../world/capitals';
import { proven, type Campaign } from './loadout';

/**
 * The hangar's ship database: everything you can meet in the Reach, from fighters to
 * battlecruisers and the guns bolted to rocks. Pure data for the Database tab.
 */

export type DbCategory = 'Fighters' | 'Gunships' | 'Capital ships' | 'Civilian' | 'Installations';

export type DbShow = { kind: 'ship'; classId: string; faction: FactionId } | { kind: 'capital'; capital: CapitalKind; faction: FactionId };

export interface DbEntry {
  id: string;
  name: string;
  category: DbCategory;
  /** Who flies or builds it. */
  operators: FactionId[];
  blurb: string;
  facts: [string, string][];
  show: DbShow;
}

export const DB_CATEGORIES: DbCategory[] = ['Fighters', 'Gunships', 'Capital ships', 'Civilian', 'Installations'];

const ms = (n: number) => `${Math.round(n)} m/s`;

function shipFacts(cls: ShipClass): [string, string][] {
  const out: [string, string][] = [
    ['Hull', String(cls.hull)],
    ['Shields', cls.shields >= 10000 ? 'cargo-grade field' : String(cls.shields)],
  ];
  if (!cls.anchored) out.push(['Speed', `${ms(cls.maxSpeed)}, boost ${ms(cls.boostSpeed)}`]);
  if (cls.gun.damage > 0) {
    if (cls.weaponSlots) out.push(['Weapon slots', String(cls.weaponSlots)]);
    else out.push(['Guns', cls.gun.turretArc ? `turret, ${Math.round(cls.gun.range)} m reach` : `${Math.round(cls.gun.range)} m reach`]);
  }
  if (cls.missiles) out.push(['Missiles', String(cls.missiles)]);
  if (cls.maker && cls.weaponSlots) {
    const maker = cls.maker;
    out.push(['Sold', cls.forSale === false ? 'never' : maker === 'kestrel' ? 'to anyone' : `to ${FACTIONS[maker].name} pilots`]);
    if (cls.forSale !== false) out.push(['Price', `${cls.price.toLocaleString('en-US')} cr`]);
  }
  if (cls.bounty) out.push(['Bounty', `${cls.bounty.toLocaleString('en-US')} cr`]);
  return out;
}

function ship(id: string, category: DbCategory, operators: FactionId[], blurb?: string): DbEntry {
  const cls = SHIP_CLASSES[id];
  return {
    id,
    name: cls.name,
    category,
    operators,
    blurb: blurb ?? cls.description ?? '',
    facts: shipFacts(cls),
    show: { kind: 'ship', classId: id, faction: operators[0] },
  };
}

function capital(kind: CapitalKind, operators: FactionId[], blurb: string): DbEntry {
  const info = CAPITAL_INFO[kind];
  return {
    id: `capital-${kind}`,
    name: info.label,
    category: 'Capital ships',
    operators,
    blurb: `${info.role} ${blurb}`,
    facts: [
      ['Length', `about ${info.length} m`],
      ['Crew', info.crew],
    ],
    show: { kind: 'capital', capital: kind, faction: operators[0] },
  };
}

export const DATABASE: DbEntry[] = [
  ship('kite', 'Fighters', ['player', 'drift'], 'The Reach\'s everyman fighter, built by the independent yards and flown by anyone who cannot afford better. A long drooped nose, a canopy pod, twin nacelles and a hoop over the tail.'),
  ship('wren', 'Fighters', ['kestrel']),
  ship('warden', 'Fighters', ['kestrel']),
  ship('lancer', 'Fighters', ['player']),
  ship('talon', 'Fighters', ['player', 'kestrel', 'patrol']),
  ship('corsair', 'Fighters', ['player']),
  ship('sabre', 'Fighters', ['combine']),
  ship('halberd', 'Fighters', ['combine']),
  ship('gannet', 'Fighters', ['drift']),
  ship('bulwark', 'Fighters', ['drift']),
  ship('fang', 'Fighters', ['wake']),
  ship('raider', 'Fighters', ['wake'], 'The Red Wake\'s disposable raider: a stubby body between two forward prongs and drooping blade wings. Cheap, numerous and flown in packs.'),
  ship('interdictor', 'Fighters', ['patrol']),
  ship('drone', 'Fighters', ['combine', 'wake', 'drift'], 'Unmanned and tiny: a faceted core with one eye, a guard ring and three vanes. A single burst kills one, but they come in clouds and nobody grieves for them.'),
  ship('brute', 'Gunships', ['wake'], 'A Wake gunship: a slab of armour with turrets that track you all the way round. Too slow to chase you, too tough to ignore. Stay on its tail.'),
  capital('frigate', ['drift', 'combine', 'wake'], 'An arrowhead delta. Drift frigates wear rings round the spine; Combine ones are clean ivory.'),
  capital('destroyer', ['wake', 'combine', 'drift'], 'A hammerhead bow over a through-bay you can fly into.'),
  capital('carrier', ['combine', 'drift'], 'A tuning fork: two prongs with the landing deck between them, the engineering block at the palm.'),
  capital('battlecruiser', ['combine', 'drift'], 'A bladed prow, layered decks, a command tower offset to port and four heavy barbettes. The Sovereign Dawn is one.'),
  ship('freighter', 'Civilian', ['drift'], 'Drift bulk hauler: a long spine of cargo pods behind a small bridge. Slow, enormous, and the reason half the Reach eats.'),
  ship('shuttle', 'Civilian', ['kestrel'], 'Crew and passenger transport between stations and ships.'),
  ship('habitat', 'Installations', ['wake'], 'A pressurised living module. At the Gallows, it is where the Red Wake keep their families.'),
  ship('turret', 'Installations', ['wake', 'combine'], 'A gun turret on a mounting plate: bolted to rock, station or hull.'),
  ship('cannon', 'Installations', ['combine'], 'A heavy gun barbette: slow, long-ranged shells that hurt anything they hit.'),
  ship('relay', 'Installations', ['wake'], 'A comms relay mast. Take it out and nobody hears the call for help.'),
];

/**
 * Faction yard hulls stay out of the database until you have met one in a mission or the yard
 * has opened to you; everything else is common knowledge.
 */
export function dbVisible(e: DbEntry, c: Campaign): boolean {
  if (e.show.kind !== 'ship') return true;
  const cls = SHIP_CLASSES[e.show.classId];
  const maker = cls.maker;
  if (!maker || maker === 'kestrel') return true;
  return c.unlimited || proven(c, maker) || c.seen.includes(cls.id);
}
