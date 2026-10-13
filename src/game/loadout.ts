import { DEFAULT_MISSILE, SHIP_CLASSES, type GunSpec, type MissileSpec, type ShipClass } from '../entities/shipClasses';

/**
 * Everything the player can own and fit: ships, per-ship upgrade tiers, gun and missile types,
 * and equipment. Weapons and equipment are bought once and can be fitted to any owned ship;
 * upgrades belong to the hull they were installed on.
 */

// ---------------------------------------------------------------------------------------------
// Catalogue

export const PLAYER_SHIPS = ['kite', 'warden', 'lancer', 'corsair', 'halberd'] as const;
export type PlayerShipId = (typeof PLAYER_SHIPS)[number];

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
    price: 0,
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
    price: 9000,
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
    price: 16000,
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
    price: 12000,
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
  /** Rounds carried per point of the ship's missile capacity. */
  ammo: number;
  spec: MissileSpec;
}

export const MISSILE_TYPES: Record<string, MissileType> = {
  seeker: {
    id: 'seeker',
    name: 'Seeker missiles',
    description: 'Lock on, fire, break away. Good all-rounder; flares and tight structures defeat it.',
    price: 0,
    ammo: 1,
    spec: { ...DEFAULT_MISSILE },
  },
  rockets: {
    id: 'rockets',
    name: 'Rocket pods',
    description: 'Unguided pairs that need no lock. Fast and plentiful, with a small blast. Point and pray.',
    price: 7000,
    ammo: 3,
    spec: { kind: 'rocket', damage: 38, speed: 290, turnRate: 0, lockTime: 0, salvo: 2, refire: 0.28, life: 4, blast: 14, scale: 0.7 },
  },
  swarm: {
    id: 'swarm',
    name: 'Swarm pack',
    description: 'Four small missiles per lock that weave in from different angles. Hard to shake, light punch each.',
    price: 15000,
    ammo: 0.6,
    spec: { kind: 'swarm', damage: 24, speed: 195, turnRate: 3.1, lockTime: 0.8, salvo: 4, refire: 1.2, life: 6, blast: 0, scale: 0.6 },
  },
  torpedo: {
    id: 'torpedo',
    name: 'Breacher torpedoes',
    description: 'Slow, long lock, enormous warhead. Made for gunships and capital ships; fighters simply outrun it.',
    price: 20000,
    ammo: 0.3,
    spec: { kind: 'torpedo', damage: 320, speed: 125, turnRate: 0.9, lockTime: 2.2, salvo: 1, refire: 2, life: 14, blast: 30, scale: 1.8 },
  },
};

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

export interface ShipFit {
  upgrades: Partial<Record<UpgradeId, number>>;
  gun: string;
  missile: string;
  equipment: EquipmentId[];
}

export interface Campaign {
  credits: number;
  allegiance: 'combine' | 'drift' | null;
  activeShip: string;
  ships: string[];
  fits: Record<string, ShipFit>;
  guns: string[];
  missiles: string[];
  equipment: EquipmentId[];
  /** Times each mission has been completed (replays pay less). */
  completed: Record<string, number>;
  /** Story outcomes ("gallows" -> "burned" | "watched" | "defended" | "lost"). */
  flags: Record<string, string>;
}

export const newFit = (): ShipFit => ({ upgrades: {}, gun: 'pulse', missile: 'seeker', equipment: [] });

export function newCampaign(): Campaign {
  return {
    credits: 0,
    allegiance: null,
    activeShip: 'kite',
    ships: ['kite'],
    fits: { kite: newFit() },
    guns: ['pulse'],
    missiles: ['seeker'],
    equipment: [],
    completed: {},
    flags: {},
  };
}

/** Fills in fields missing from saves made by older builds. */
export function migrateCampaign(raw: Partial<Campaign> | null): Campaign {
  const c = { ...newCampaign(), ...(raw ?? {}) };
  c.ships = c.ships.filter((s) => SHIP_CLASSES[s]);
  if (!c.ships.includes('kite')) c.ships.unshift('kite');
  if (!c.ships.includes(c.activeShip)) c.activeShip = c.ships[0];
  for (const s of c.ships) c.fits[s] = { ...newFit(), ...(c.fits[s] ?? {}) };
  if (!c.guns.includes('pulse')) c.guns.unshift('pulse');
  if (!c.missiles.includes('seeker')) c.missiles.unshift('seeker');
  return c;
}

// ---------------------------------------------------------------------------------------------
// Fitting a ship

/** Runtime equipment state carried by the player's ship. */
export interface Fitted {
  shipId: string;
  gun: GunType;
  missile: MissileType;
  equipment: Set<EquipmentId>;
}

/** Applies upgrades and weapons to a ship class, returning the stats the ship flies with. */
export function fitShip(shipId: string, fit: ShipFit): { cls: ShipClass; fitted: Fitted } {
  const base = SHIP_CLASSES[shipId];
  const tier = (id: UpgradeId) => Math.min(MAX_TIER, fit.upgrades[id] ?? 0);
  const gun = GUN_TYPES[fit.gun] ?? GUN_TYPES.pulse;
  const missile = MISSILE_TYPES[fit.missile] ?? MISSILE_TYPES.seeker;
  const equipment = new Set(fit.equipment.slice(0, base.equipSlots ?? 2));
  const eng = 1 + 0.05 * tier('engines');
  const thr = 1 + 0.06 * tier('thrusters');
  const cool = tier('cooling');
  const reactor = 1 + 0.15 * tier('reactor');
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
    gun: {
      damage: base.gun.damage * gun.damage,
      cooldown: base.gun.cooldown * gun.cooldown * Math.pow(0.94, cool),
      boltSpeed: base.gun.boltSpeed * gun.speed,
      energyCost: base.gun.energyCost * gun.energy * Math.pow(0.9, cool),
      range: base.gun.range * gun.range,
      pellets: gun.pellets,
      spread: gun.spread,
      boltScale: gun.boltScale,
      sound: gun.sound,
    },
    missiles: Math.max(1, Math.round(base.missiles * missile.ammo * (equipment.has('magazine') ? 1.5 : 1))),
    missile: {
      ...missile.spec,
      lockTime: missile.spec.lockTime * (equipment.has('targeting') ? 0.55 : 1),
    },
  };
  return { cls, fitted: { shipId, gun, missile, equipment } };
}

/** Rough combat rating for the shop's comparison bars. */
export function shipStats(cls: ShipClass): { label: string; value: number; max: number; text: string }[] {
  const dps = (cls.gun.damage * (cls.gun.pellets ?? 1)) / cls.gun.cooldown;
  return [
    { label: 'Hull', value: cls.hull, max: 600, text: String(Math.round(cls.hull)) },
    { label: 'Shields', value: cls.shields, max: 420, text: String(Math.round(cls.shields)) },
    { label: 'Speed', value: cls.maxSpeed, max: 140, text: `${Math.round(cls.maxSpeed)} m/s` },
    { label: 'Boost', value: cls.boostSpeed, max: 280, text: `${Math.round(cls.boostSpeed)} m/s` },
    { label: 'Turn rate', value: cls.pitchRate, max: 2.8, text: `${Math.round((cls.pitchRate * 180) / Math.PI)}°/s` },
    { label: 'Gun damage', value: dps, max: 200, text: `${Math.round(dps)}/s` },
    { label: 'Gun range', value: cls.gun.range, max: 1200, text: `${Math.round(cls.gun.range)} m` },
    { label: 'Energy', value: cls.energy, max: 220, text: String(Math.round(cls.energy)) },
    { label: 'Missiles', value: cls.missiles, max: 40, text: String(cls.missiles) },
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
export function missionPayout(campaign: Campaign, missionId: string, basePay: number, bounties: number): Payout {
  const replayFactor = (campaign.completed[missionId] ?? 0) > 0 ? 0.4 : 1;
  return { base: basePay, bounties, replayFactor, total: Math.round((basePay + bounties) * replayFactor) };
}
