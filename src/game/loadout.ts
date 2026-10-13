import { FACTIONS, type FactionId } from '../entities/factions';
import { DEFAULT_MISSILE, SHIP_CLASSES, type GunSpec, type MissileSpec, type ShipClass } from '../entities/shipClasses';

/**
 * Everything the player can own and fit: ships, per-ship upgrade tiers, gun and missile types,
 * and equipment. Weapons and equipment are bought once and can be fitted to any owned ship;
 * upgrades belong to the hull they were installed on.
 */

// ---------------------------------------------------------------------------------------------
// Catalogue

/** Every hull the player can fly, grouped by the yard that builds it. */
export const PLAYER_SHIPS = ['wren', 'kite', 'warden', 'lancer', 'talon', 'corsair', 'sabre', 'halberd', 'gannet', 'bulwark', 'fang', 'interdictor', 'scarlet'] as const;
export type PlayerShipId = (typeof PLAYER_SHIPS)[number];

/**
 * Whether a yard shows up in the shop at all: the independent yards always, a faction's yards
 * once you have proven yourself to it (or with the test cheat on).
 */
export function yardVisible(yard: FactionId, c: Pick<Campaign, 'allegiance' | 'unlimited' | 'standing' | 'ships'>): boolean {
  if (yard === 'rose') return c.unlimited || c.ships.includes('scarlet');
  return yard === 'kestrel' || c.unlimited || proven(c, yard);
}

/** Yards in shop order. */
export const YARDS: FactionId[] = ['kestrel', 'combine', 'drift', 'wake', 'patrol', 'rose'];

export interface Availability {
  /** Can be bought now. */
  ok: boolean;
  /** Why not (or a note on why it is allowed). */
  reason: string;
}

/**
 * Who can buy what. Independent yards sell to anyone; a faction's yards sell only to pilots
 * working for it; the Patrol sells nothing. The Ctrl+P test cheat opens every yard.
 */
export function shipAvailability(shipId: string, campaign: Pick<Campaign, 'allegiance' | 'unlimited' | 'standing'>): Availability {
  const cls = SHIP_CLASSES[shipId];
  const maker = cls.maker ?? 'kestrel';
  const restricted = cls.forSale === false || (maker !== 'kestrel' && !proven(campaign, maker));
  if (!restricted) return { ok: true, reason: '' };
  if (campaign.unlimited) return { ok: true, reason: 'Unlocked by the test cheat' };
  if (cls.forSale === false) return { ok: false, reason: 'Not for sale' };
  return { ok: false, reason: `Fly a contract for the ${FACTIONS[maker].name} first` };
}

export interface GunType {
  id: string;
  name: string;
  description: string;
  price: number;
  damage: number;
  cooldown: number;
  energy: number;
  speed: number;
  range: number;
  pellets?: number;
  spread?: number;
  boltScale?: number;
  sound: NonNullable<GunSpec['sound']>;
}

export const GUN_TYPES: Record<string, GunType> = {
  pulse: {
    id: 'pulse',
    name: 'Pulse lasers',
    description: 'The standard. Balanced damage, rate and reach.',
    price: 3000,
    damage: 1,
    cooldown: 1,
    energy: 1,
    speed: 1,
    range: 1,
    sound: 'pulse',
  },
  rapid: {
    id: 'rapid',
    name: 'Rapid lasers',
    description: 'Twice the rate of fire at half the punch. Easy to keep on target, hungry for energy over time.',
    price: 6000,
    damage: 0.55,
    cooldown: 0.5,
    energy: 0.62,
    speed: 1.1,
    range: 0.9,
    boltScale: 0.7,
    sound: 'rapid',
  },
  cannon: {
    id: 'cannon',
    name: 'Mass drivers',
    description: 'Slow, heavy slugs that hit like a door. Lead your target: they travel slower.',
    price: 9000,
    damage: 2.7,
    cooldown: 2.4,
    energy: 2,
    speed: 0.78,
    range: 1.15,
    boltScale: 1.9,
    sound: 'cannon',
  },
  scatter: {
    id: 'scatter',
    name: 'Scatter guns',
    description: 'Five pellets per shot in a tight cone. Devastating up close, useless at range.',
    price: 7000,
    damage: 0.42,
    cooldown: 1.8,
    energy: 1.6,
    speed: 0.9,
    range: 0.5,
    pellets: 5,
    spread: 0.035,
    boltScale: 0.8,
    sound: 'scatter',
  },
};

export interface MissileType {
  id: string;
  name: string;
  description: string;
  price: number;
  /** Magazine rounds used per trigger pull. */
  cost: number;
  spec: MissileSpec;
}

export const MISSILE_TYPES: Record<string, MissileType> = {
  seeker: {
    id: 'seeker',
    name: 'Seeker launcher',
    description: 'Lock on, fire, break away. Good all-rounder; flares and tight structures defeat it.',
    price: 4000,
    cost: 1,
    spec: { ...DEFAULT_MISSILE },
  },
  rockets: {
    id: 'rockets',
    name: 'Rocket pods',
    description: 'Unguided pairs that need no lock. Fast and plentiful, with a small blast. Point and pray.',
    price: 5000,
    cost: 0.34,
    spec: { kind: 'rocket', damage: 38, speed: 290, turnRate: 0, lockTime: 0, salvo: 2, refire: 0.28, life: 4, blast: 14, scale: 0.7 },
  },
  swarm: {
    id: 'swarm',
    name: 'Swarm launcher',
    description: 'Four small missiles per lock that weave in from different angles. Hard to shake, light punch each.',
    price: 9000,
    cost: 1.7,
    spec: { kind: 'swarm', damage: 24, speed: 195, turnRate: 3.1, lockTime: 0.8, salvo: 4, refire: 1.2, life: 6, blast: 0, scale: 0.6 },
  },
  torpedo: {
    id: 'torpedo',
    name: 'Breacher torpedo tube',
    description: 'Slow, long lock, enormous warhead. Made for gunships and capital ships; fighters simply outrun it.',
    price: 12000,
    cost: 3.4,
    spec: { kind: 'torpedo', damage: 320, speed: 125, turnRate: 0.9, lockTime: 2.2, salvo: 1, refire: 2, life: 14, blast: 30, scale: 1.8 },
  },
};

/** A weapon slot holds a gun or a missile launcher; ids are unique across both tables. */
export type WeaponInfo = ({ kind: 'gun' } & GunType) | ({ kind: 'launcher' } & MissileType);

export function weaponInfo(id: string): WeaponInfo | null {
  if (GUN_TYPES[id]) return { kind: 'gun', ...GUN_TYPES[id] };
  if (MISSILE_TYPES[id]) return { kind: 'launcher', ...MISSILE_TYPES[id] };
  return null;
}

/** Whether a weapon can go in a slot of this ship (launchers need a missile magazine). */
export function canMount(shipId: string, weaponId: string): boolean {
  const w = weaponInfo(weaponId);
  if (!w) return false;
  return w.kind === 'gun' || SHIP_CLASSES[shipId].missiles > 0;
}

export type UpgradeId = 'engines' | 'thrusters' | 'shields' | 'armour' | 'reactor' | 'cooling';

export interface UpgradeType {
  id: UpgradeId;
  name: string;
  /** Per-tier effect, for the shop. */
  effect: string;
  basePrice: number;
}

export const UPGRADES: UpgradeType[] = [
  { id: 'engines', name: 'Engines', effect: '+5% top speed and boost per tier', basePrice: 4000 },
  { id: 'thrusters', name: 'Manoeuvring thrusters', effect: '+6% pitch, yaw and roll rate per tier', basePrice: 4000 },
  { id: 'shields', name: 'Shield generator', effect: '+15% shield capacity, +10% recharge per tier', basePrice: 5000 },
  { id: 'armour', name: 'Hull armour', effect: '+18% hull per tier', basePrice: 4500 },
  { id: 'reactor', name: 'Reactor', effect: '+15% energy capacity and regeneration per tier', basePrice: 5000 },
  { id: 'cooling', name: 'Gun cooling', effect: '-6% time between shots, -10% energy per shot per tier', basePrice: 4500 },
];
export const MAX_TIER = 3;

export type EquipmentId = 'flares' | 'shieldCell' | 'repair' | 'afterburner' | 'magazine' | 'targeting' | 'dockingComputer';

export interface EquipmentType {
  id: EquipmentId;
  name: string;
  description: string;
  price: number;
}

export const EQUIPMENT: Record<EquipmentId, EquipmentType> = {
  flares: {
    id: 'flares',
    name: 'Flare dispenser',
    description: 'Ten flares per sortie. Each one has a good chance to pull a missile off you.',
    price: 6000,
  },
  shieldCell: {
    id: 'shieldCell',
    name: 'Emergency shield cell',
    description: 'When your shields collapse, refills 60% of them at once. Recharges in 30 seconds.',
    price: 9000,
  },
  repair: {
    id: 'repair',
    name: 'Repair drones',
    description: 'Patch the hull at 3 points a second once you have gone 6 seconds without being hit.',
    price: 12000,
  },
  afterburner: {
    id: 'afterburner',
    name: 'Afterburner tank',
    description: 'Boost burns 35% less energy.',
    price: 7000,
  },
  magazine: {
    id: 'magazine',
    name: 'Extended magazine',
    description: '+50% missile ammunition.',
    price: 6000,
  },
  targeting: {
    id: 'targeting',
    name: 'Targeting computer',
    description: 'Missile locks form 45% faster and gun lead assist is twice as strong.',
    price: 8000,
  },
  dockingComputer: {
    id: 'dockingComputer',
    name: 'Docking computer',
    description: 'Once you have clearance, press the dock key again and it flies you in. For pilots with better things to do.',
    price: 4000,
  },
};

export function upgradePrice(shipId: string, up: UpgradeType, tier: number): number {
  const shipFactor = 1 + SHIP_CLASSES[shipId].price / 60000;
  return Math.round((up.basePrice * tier * shipFactor) / 100) * 100;
}

// ---------------------------------------------------------------------------------------------
// Save state

/** What a new campaign starts with; the first ship is bought out of it. */
export const START_BUDGET = 40000;

export interface ShipFit {
  upgrades: Partial<Record<UpgradeId, number>>;
  /** One entry per weapon slot: a gun or launcher id, or null for an empty slot. */
  weapons: (string | null)[];
  equipment: EquipmentId[];
}

export interface Campaign {
  /** False until the first ship has been picked. */
  started: boolean;
  credits: number;
  /** Test cheat (Ctrl+P): purchases cost nothing. */
  unlimited: boolean;
  allegiance: Side | null;
  activeShip: string;
  ships: string[];
  fits: Record<string, ShipFit>;
  /** Unfitted weapons in storage, by id. */
  inventory: Record<string, number>;
  equipment: EquipmentId[];
  /** Times each mission has been completed (replays pay less). */
  completed: Record<string, number>;
  /** Story outcomes ("gallows" -> "burned" | "watched" | "defended" | "lost"). */
  flags: Record<string, string>;
  /** Contracts flown for each faction. One proves you to them and opens their yards. */
  standing: Partial<Record<Side, number>>;
  /** Ship classes met in missions (unlocks their database entries). */
  seen: string[];
  /** Hardcore: one life. Dying ends the campaign. */
  hardcore: boolean;
  /** Set when a hardcore pilot dies: the campaign is over. */
  dead: boolean;
  /** Odd jobs on offer right now (a few at a time). */
  board: string[];
  /** Side activities flown since the last story chapter (they are capped while the story waits). */
  sideDone: number;
}

/** What dying costs on a standard campaign: the tug that recovers you, and the repairs. */
export const DEATH_FEE = 2500;
/** Side activities allowed per story chapter. */
export const SIDE_PER_CHAPTER = 2;

export type Side = 'combine' | 'drift' | 'wake';

/** True once you work for `faction` and have flown a contract for it. */
export function proven(c: Pick<Campaign, 'allegiance' | 'standing'>, faction: FactionId): boolean {
  return faction === c.allegiance && (c.standing[faction] ?? 0) > 0;
}

/**
 * Changing sides: the faction you leave takes its hulls back (weapons go to storage, upgrades
 * go with the hull), and if that leaves you with nothing to fly, Kestrel lends you a Kite.
 * Returns the names of the ships taken.
 */
export function defect(c: Campaign, to: Side): string[] {
  const from = c.allegiance;
  const taken: string[] = [];
  if (from && from !== to) {
    for (const id of [...c.ships]) {
      if (SHIP_CLASSES[id].maker !== from) continue;
      for (const w of c.fits[id]?.weapons ?? []) if (w) c.inventory[w] = (c.inventory[w] ?? 0) + 1;
      c.ships = c.ships.filter((s) => s !== id);
      delete c.fits[id];
      taken.push(SHIP_CLASSES[id].name);
    }
  }
  if (!c.ships.length) {
    c.ships = ['kite'];
    c.fits.kite = newFit('kite');
  }
  if (!c.ships.includes(c.activeShip)) c.activeShip = c.ships[0];
  c.allegiance = to;
  // turning on your old side in front of the new one is proof enough
  c.standing[to] = Math.max(1, c.standing[to] ?? 0);
  return taken;
}

/** The fit a hull comes with from the yard: stock weapons, no upgrades. */
export function newFit(shipId: string): ShipFit {
  const cls = SHIP_CLASSES[shipId];
  const slots = cls.weaponSlots ?? 2;
  const weapons: (string | null)[] = [];
  for (let i = 0; i < slots; i++) weapons.push(cls.defaultWeapons?.[i] ?? null);
  return { upgrades: {}, weapons, equipment: [] };
}

export function newCampaign(): Campaign {
  return {
    started: false,
    credits: START_BUDGET,
    unlimited: false,
    allegiance: null,
    activeShip: 'kite',
    ships: [],
    fits: {},
    inventory: {},
    equipment: [],
    completed: {},
    flags: {},
    standing: {},
    seen: [],
    hardcore: false,
    dead: false,
    board: [],
    sideDone: 0,
  };
}

type OldFit = Partial<ShipFit> & { gun?: string; missile?: string };
type OldCampaign = Partial<Campaign> & { guns?: string[]; missiles?: string[]; fits?: Record<string, OldFit> };

/** Fills in fields missing from saves made by older builds. */
export function migrateCampaign(raw: OldCampaign | null): Campaign {
  const c = { ...newCampaign(), ...(raw ?? {}) } as Campaign & { guns?: string[]; missiles?: string[] };
  // saves from before the starting-ship pick already own a ship
  if (raw && raw.started === undefined) c.started = (raw.ships ?? []).length > 0;
  c.ships = c.ships.filter((s) => SHIP_CLASSES[s]);
  if (c.started && !c.ships.length) c.ships = ['kite'];
  if (!c.ships.includes(c.activeShip)) c.activeShip = c.ships[0] ?? 'kite';
  c.inventory = { ...(c.inventory ?? {}) };
  for (const s of c.ships) {
    const old = (c.fits[s] ?? {}) as OldFit;
    const fit = newFit(s);
    fit.upgrades = old.upgrades ?? {};
    fit.equipment = old.equipment ?? [];
    if (Array.isArray(old.weapons)) {
      fit.weapons = fit.weapons.map((_, i) => old.weapons?.[i] ?? null);
      // a hull that lost slots puts the extra weapons into storage
      for (const w of old.weapons.slice(fit.weapons.length)) if (w) c.inventory[w] = (c.inventory[w] ?? 0) + 1;
    } else {
      // older saves had one gun type and one missile type per ship
      fit.weapons = fit.weapons.map((w) => (w && weaponInfo(w)?.kind === 'gun' ? (old.gun ?? w) : w && canMount(s, old.missile ?? w) ? (old.missile ?? w) : w));
    }
    c.fits[s] = fit;
  }
  for (const id of [...(c.guns ?? []), ...(c.missiles ?? [])]) {
    if (id !== 'pulse' && id !== 'seeker' && weaponInfo(id)) c.inventory[id] = Math.max(c.inventory[id] ?? 0, 1);
  }
  delete c.guns;
  delete c.missiles;
  c.standing = { ...(c.standing ?? {}) };
  c.seen = [...(c.seen ?? [])];
  c.board = [...(c.board ?? [])];
  c.sideDone = c.sideDone ?? 0;
  c.hardcore = c.hardcore ?? false;
  c.dead = c.dead ?? false;
  // saves from before standing existed: count the faction contracts already flown
  if (raw && raw.standing === undefined) {
    if (c.completed['launch-order']) c.standing.combine = c.completed['launch-order'];
    if (c.completed.flotsam) c.standing.drift = c.completed.flotsam;
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Fitting a ship

/** Runtime equipment state carried by the player's ship. */
export interface Fitted {
  shipId: string;
  weapons: (string | null)[];
  equipment: Set<EquipmentId>;
}

/** Applies upgrades and weapons to a ship class, returning the stats the ship flies with. */
export function fitShip(shipId: string, fit: ShipFit): { cls: ShipClass; fitted: Fitted } {
  const base = SHIP_CLASSES[shipId];
  const tier = (id: UpgradeId) => Math.min(MAX_TIER, fit.upgrades[id] ?? 0);
  const equipment = new Set(fit.equipment.slice(0, base.equipSlots ?? 2));
  const eng = 1 + 0.05 * tier('engines');
  const thr = 1 + 0.06 * tier('thrusters');
  const cool = tier('cooling');
  const reactor = 1 + 0.15 * tier('reactor');
  // Each gun fires on its own cycle; the base class rate assumed two guns taking turns.
  const mounts: GunSpec[] = [];
  const launchers: MissileSpec[] = [];
  for (const id of fit.weapons.slice(0, base.weaponSlots ?? 2)) {
    if (!id) continue;
    const w = weaponInfo(id);
    if (!w) continue;
    if (w.kind === 'gun') {
      mounts.push({
        damage: base.gun.damage * w.damage,
        cooldown: base.gun.cooldown * 2 * w.cooldown * Math.pow(0.94, cool),
        boltSpeed: base.gun.boltSpeed * w.speed,
        energyCost: base.gun.energyCost * w.energy * Math.pow(0.9, cool),
        range: base.gun.range * w.range,
        pellets: w.pellets,
        spread: w.spread,
        boltScale: w.boltScale,
        sound: w.sound,
      });
    } else if (base.missiles > 0) {
      launchers.push({ ...w.spec, cost: w.cost, lockTime: w.spec.lockTime * (equipment.has('targeting') ? 0.55 : 1) });
    }
  }
  const cls: ShipClass = {
    ...base,
    hull: Math.round(base.hull * (1 + 0.18 * tier('armour'))),
    shields: Math.round(base.shields * (1 + 0.15 * tier('shields'))),
    shieldRegen: base.shieldRegen * (1 + 0.1 * tier('shields')),
    maxSpeed: base.maxSpeed * eng,
    boostSpeed: base.boostSpeed * eng,
    accel: base.accel * eng,
    pitchRate: base.pitchRate * thr,
    yawRate: base.yawRate * thr,
    rollRate: base.rollRate * thr,
    energy: base.energy * reactor,
    energyRegen: base.energyRegen * reactor,
    boostDrain: base.boostDrain * (equipment.has('afterburner') ? 0.65 : 1),
    gun: mounts[0] ?? { ...base.gun, damage: 0 },
    mounts,
    launchers,
    missile: launchers[0],
    missiles: Math.round(base.missiles * (equipment.has('magazine') ? 1.5 : 1)),
  };
  return { cls, fitted: { shipId, weapons: [...fit.weapons], equipment } };
}

/** The same hull with every upgrade at its top tier: the ceiling shown faintly in the shop. */
export function maxedFit(fit: ShipFit): ShipFit {
  const upgrades: Partial<Record<UpgradeId, number>> = {};
  for (const u of UPGRADES) upgrades[u.id] = MAX_TIER;
  return { ...fit, upgrades };
}

/** Hull characteristics for the shop's comparison bars (weapons are compared separately). */
export function shipStats(cls: ShipClass): { label: string; value: number; max: number; text: string }[] {
  return [
    { label: 'Hull', value: cls.hull, max: 960, text: String(Math.round(cls.hull)) },
    { label: 'Shields', value: cls.shields, max: 600, text: String(Math.round(cls.shields)) },
    { label: 'Speed', value: cls.maxSpeed, max: 145, text: `${Math.round(cls.maxSpeed)} m/s` },
    { label: 'Boost', value: cls.boostSpeed, max: 290, text: `${Math.round(cls.boostSpeed)} m/s` },
    { label: 'Turn rate', value: cls.pitchRate, max: 3.0, text: `${Math.round((cls.pitchRate * 180) / Math.PI)}°/s` },
    { label: 'Weapon slots', value: cls.weaponSlots ?? 2, max: 6, text: String(cls.weaponSlots ?? 2) },
    { label: 'Equipment', value: cls.equipSlots ?? 2, max: 5, text: `${cls.equipSlots ?? 2} slots` },
    { label: 'Energy', value: cls.energy, max: 280, text: String(Math.round(cls.energy)) },
    { label: 'Missiles', value: cls.missiles, max: 32, text: cls.missiles ? String(cls.missiles) : 'none' },
  ];
}

// ---------------------------------------------------------------------------------------------
// Pay

export interface Payout {
  base: number;
  bounties: number;
  replayFactor: number;
  total: number;
}

/** Mission pay plus bounties; repeat runs of a mission pay 40% so the shop cannot be farmed fast. */
export function missionPayout(campaign: Campaign, missionId: string, basePay: number, bounties: number, repeatable = false): Payout {
  const replayFactor = !repeatable && (campaign.completed[missionId] ?? 0) > 0 ? 0.4 : 1;
  return { base: basePay, bounties, replayFactor, total: Math.round((basePay + bounties) * replayFactor) };
}
