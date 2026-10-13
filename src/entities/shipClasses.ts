export type ModelId =
  | 'kite'
  | 'lancer'
  | 'raider'
  | 'warden'
  | 'brute'
  | 'freighter'
  | 'corsair'
  | 'halberd'
  | 'sabre'
  | 'shuttle'
  | 'turret'
  | 'relay'
  | 'habitat'
  | 'cannon';

export interface GunSpec {
  damage: number;
  cooldown: number; // seconds between shots (alternating hardpoints)
  boltSpeed: number;
  energyCost: number;
  range: number;
  /** Turret guns fire within this half-angle (radians) of the nose instead of straight ahead. */
  turretArc?: number;
  /** Bolts per shot (scatter guns) and their cone half-angle. */
  pellets?: number;
  spread?: number;
  /** Visual bolt thickness multiplier. */
  boltScale?: number;
  /** Sound preset name; defaults by faction. */
  sound?: 'pulse' | 'rapid' | 'cannon' | 'scatter';
}

export type MissileKind = 'seeker' | 'rocket' | 'swarm' | 'torpedo';

export interface MissileSpec {
  kind: MissileKind;
  damage: number;
  speed: number;
  turnRate: number;
  /** Seconds on target to get a lock; 0 = fires unguided without a lock. */
  lockTime: number;
  /** Projectiles per trigger pull (one round of ammunition). */
  salvo: number;
  /** Seconds between trigger pulls. */
  refire: number;
  life: number;
  /** Blast radius for splash damage (0 = direct hit only). */
  blast: number;
  scale: number;
  /** Magazine rounds used per trigger pull (player launchers). */
  cost?: number;
}

export const DEFAULT_MISSILE: MissileSpec = {
  kind: 'seeker',
  damage: 75,
  speed: 200,
  turnRate: 2.3,
  lockTime: 1.1,
  salvo: 1,
  refire: 0.7,
  life: 9,
  blast: 0,
  scale: 1,
};

export interface ShipClass {
  id: string;
  name: string;
  model: ModelId;
  radius: number;
  hull: number;
  shields: number;
  shieldRegen: number; // per second
  shieldDelay: number; // seconds after a hit before regen
  maxSpeed: number;
  boostSpeed: number;
  strafeSpeed: number;
  accel: number; // velocity response (1/s)
  pitchRate: number; // rad/s
  yawRate: number;
  rollRate: number;
  turnResponse: number;
  energy: number;
  energyRegen: number;
  boostDrain: number;
  gun: GunSpec;
  missiles: number;
  /** Missile type; AI ships use DEFAULT_MISSILE with slower motors. */
  missile?: MissileSpec;
  /** Player ships: weapon slots (each takes a gun or, if the ship carries missiles, a launcher). */
  weaponSlots?: number;
  /** What a newly bought hull comes with. */
  defaultWeapons?: string[];
  /** Fitted guns, one per gun slot (set by the loadout, player ships only). */
  mounts?: GunSpec[];
  /** Fitted missile launchers (set by the loadout). */
  launchers?: MissileSpec[];
  price: number;
  /** Equipment slots (player ships). */
  equipSlots?: number;
  /** Shop blurb. */
  description?: string;
  /** Credits paid for destroying one. */
  bounty?: number;
  /** Compound collision for long hulls: local [x, y, z, radius] spheres. */
  hitSpheres?: [number, number, number, number][];
  /** Civilian traffic: never targeted, never shoots. */
  civilian?: boolean;
  /** Fixed installation: never moves (turrets, relays, modules). */
  anchored?: boolean;
}

/**
 * Ship stats are pure data so hangar/shop screens can list, compare and swap them later.
 */
export const SHIP_CLASSES: Record<string, ShipClass> = {
  kite: {
    id: 'kite',
    name: 'Kite MkII Interceptor',
    model: 'kite',
    radius: 3.2,
    hull: 160,
    shields: 140,
    shieldRegen: 18,
    shieldDelay: 2.5,
    maxSpeed: 105,
    boostSpeed: 210,
    strafeSpeed: 32,
    accel: 2.2,
    pitchRate: 2.1,
    yawRate: 1.45,
    rollRate: 3.4,
    turnResponse: 7,
    energy: 100,
    energyRegen: 16,
    boostDrain: 24,
    gun: { damage: 9, cooldown: 0.085, boltSpeed: 720, energyCost: 1.2, range: 900 },
    missiles: 8,
    equipSlots: 2,
    description: 'Light interceptor. Quick, forgiving and cheap to fix. Two equipment slots.',
    weaponSlots: 3,
    defaultWeapons: ['pulse', 'pulse', 'seeker'],
    price: 10000,
  },
  lancer: {
    id: 'lancer',
    name: 'Lancer Heavy Fighter',
    model: 'lancer',
    radius: 3.8,
    hull: 260,
    shields: 200,
    shieldRegen: 16,
    shieldDelay: 3,
    maxSpeed: 92,
    boostSpeed: 185,
    strafeSpeed: 26,
    accel: 1.8,
    pitchRate: 1.7,
    yawRate: 1.15,
    rollRate: 2.6,
    turnResponse: 6,
    energy: 120,
    energyRegen: 18,
    boostDrain: 26,
    gun: { damage: 14, cooldown: 0.11, boltSpeed: 680, energyCost: 1.6, range: 950 },
    missiles: 14,
    equipSlots: 3,
    description: 'Heavy fighter with long-barrelled guns and a deep missile bay. Slower to turn, hard to kill.',
    weaponSlots: 4,
    defaultWeapons: ['pulse', 'pulse', 'seeker', 'seeker'],
    price: 42000,
  },
  raider: {
    id: 'raider',
    name: 'Wake Cutter',
    model: 'raider',
    radius: 3.2,
    hull: 90,
    shields: 60,
    shieldRegen: 10,
    shieldDelay: 3,
    maxSpeed: 98,
    boostSpeed: 175,
    strafeSpeed: 25,
    accel: 2.0,
    pitchRate: 1.75,
    yawRate: 1.0,
    rollRate: 3.0,
    turnResponse: 6,
    energy: 100,
    energyRegen: 14,
    boostDrain: 22,
    gun: { damage: 6, cooldown: 0.16, boltSpeed: 620, energyCost: 1.5, range: 800 },
    missiles: 0,
    bounty: 600,
    price: 18000,
  },
  warden: {
    id: 'warden',
    name: 'Kestrel Warden',
    model: 'warden',
    radius: 3.4,
    hull: 120,
    shields: 120,
    shieldRegen: 18,
    shieldDelay: 2.2,
    maxSpeed: 120,
    boostSpeed: 245,
    strafeSpeed: 38,
    accel: 2.6,
    pitchRate: 2.35,
    yawRate: 1.65,
    rollRate: 4.0,
    turnResponse: 8,
    energy: 100,
    energyRegen: 18,
    boostDrain: 20,
    gun: { damage: 7, cooldown: 0.1, boltSpeed: 700, energyCost: 1.1, range: 850 },
    missiles: 0,
    equipSlots: 2,
    description: 'Ring-drive skimmer from the Kestrel militia yards. Tiny, light and very quick on its feet. It will not take much punishment.',
    bounty: 900,
    weaponSlots: 2,
    defaultWeapons: ['pulse', 'pulse'],
    price: 22000,
  },

  corsair: {
    id: 'corsair',
    name: 'Corsair Striker',
    model: 'corsair',
    radius: 3.4,
    hull: 190,
    shields: 170,
    shieldRegen: 20,
    shieldDelay: 2.4,
    maxSpeed: 116,
    boostSpeed: 235,
    strafeSpeed: 36,
    accel: 2.4,
    pitchRate: 2.25,
    yawRate: 1.55,
    rollRate: 3.8,
    turnResponse: 7.5,
    energy: 110,
    energyRegen: 18,
    boostDrain: 22,
    gun: { damage: 9, cooldown: 0.07, boltSpeed: 760, energyCost: 1.15, range: 920 },
    missiles: 8,
    equipSlots: 3,
    description: 'Racing-bred striker with three gun mounts. The fastest thing you can legally buy out here.',
    weaponSlots: 3,
    defaultWeapons: ['pulse', 'pulse', 'seeker'],
    price: 58000,
  },
  halberd: {
    id: 'halberd',
    name: 'Halberd Assault Fighter',
    model: 'halberd',
    radius: 5.2,
    hull: 420,
    shields: 300,
    shieldRegen: 22,
    shieldDelay: 3.2,
    maxSpeed: 88,
    boostSpeed: 175,
    strafeSpeed: 24,
    accel: 1.7,
    pitchRate: 1.55,
    yawRate: 1.05,
    rollRate: 2.3,
    turnResponse: 5.5,
    energy: 150,
    energyRegen: 22,
    boostDrain: 26,
    gun: { damage: 13, cooldown: 0.1, boltSpeed: 700, energyCost: 1.5, range: 980 },
    missiles: 20,
    equipSlots: 4,
    description: 'Four guns, a torpedo-rated bay and armour like a bulkhead. Built to take on gunships.',
    weaponSlots: 4,
    defaultWeapons: ['pulse', 'pulse', 'seeker', 'seeker'],
    price: 75000,
  },
  sabre: {
    id: 'sabre',
    name: 'Combine Sabre',
    model: 'sabre',
    radius: 3.5,
    hull: 170,
    shields: 160,
    shieldRegen: 16,
    shieldDelay: 3,
    maxSpeed: 104,
    boostSpeed: 200,
    strafeSpeed: 28,
    accel: 2.1,
    pitchRate: 1.9,
    yawRate: 1.2,
    rollRate: 3.1,
    turnResponse: 6.5,
    energy: 110,
    energyRegen: 16,
    boostDrain: 22,
    gun: { damage: 8, cooldown: 0.12, boltSpeed: 700, energyCost: 1.3, range: 900 },
    missiles: 4,
    bounty: 1200,
    price: 0,
  },
  shuttle: {
    id: 'shuttle',
    name: 'Transport shuttle',
    model: 'shuttle',
    radius: 7,
    hull: 600,
    shields: 300,
    shieldRegen: 12,
    shieldDelay: 4,
    maxSpeed: 70,
    boostSpeed: 110,
    strafeSpeed: 10,
    accel: 1.2,
    pitchRate: 0.9,
    yawRate: 0.7,
    rollRate: 1.2,
    turnResponse: 3,
    energy: 100,
    energyRegen: 10,
    boostDrain: 10,
    gun: { damage: 0, cooldown: 99, boltSpeed: 1, energyCost: 0, range: 0 },
    missiles: 0,
    hitSpheres: [
      [0, 0, -6, 6],
      [0, 0, 5, 6.5],
    ],
    civilian: true,
    price: 0,
  },
  turret: {
    id: 'turret',
    name: 'Gun turret',
    model: 'turret',
    radius: 6,
    hull: 260,
    shields: 90,
    shieldRegen: 8,
    shieldDelay: 4,
    maxSpeed: 0,
    boostSpeed: 0,
    strafeSpeed: 0,
    accel: 0,
    pitchRate: 1.2,
    yawRate: 1.2,
    rollRate: 0,
    turnResponse: 4,
    energy: 200,
    energyRegen: 30,
    boostDrain: 0,
    gun: { damage: 5, cooldown: 0.16, boltSpeed: 640, energyCost: 1, range: 1100, turretArc: 0.3 },
    missiles: 0,
    anchored: true,
    bounty: 900,
    price: 0,
  },
  cannon: {
    id: 'cannon',
    name: 'Heavy gun barbette',
    model: 'cannon',
    radius: 9,
    hull: 600,
    shields: 250,
    shieldRegen: 10,
    shieldDelay: 5,
    maxSpeed: 0,
    boostSpeed: 0,
    strafeSpeed: 0,
    accel: 0,
    pitchRate: 0.6,
    yawRate: 0.6,
    rollRate: 0,
    turnResponse: 2,
    energy: 400,
    energyRegen: 40,
    boostDrain: 0,
    gun: { damage: 30, cooldown: 1.1, boltSpeed: 430, energyCost: 1, range: 2600, turretArc: 0.25, boltScale: 3.2, sound: 'cannon' },
    missiles: 0,
    anchored: true,
    bounty: 2500,
    price: 0,
  },
  relay: {
    id: 'relay',
    name: 'Comms relay',
    model: 'relay',
    radius: 16,
    hull: 1100,
    shields: 400,
    shieldRegen: 15,
    shieldDelay: 5,
    maxSpeed: 0,
    boostSpeed: 0,
    strafeSpeed: 0,
    accel: 0,
    pitchRate: 0,
    yawRate: 0,
    rollRate: 0,
    turnResponse: 1,
    energy: 100,
    energyRegen: 10,
    boostDrain: 0,
    gun: { damage: 0, cooldown: 99, boltSpeed: 1, energyCost: 0, range: 0 },
    missiles: 0,
    anchored: true,
    bounty: 3000,
    price: 0,
  },
  habitat: {
    id: 'habitat',
    name: 'Habitat module',
    model: 'habitat',
    radius: 46,
    hull: 2600,
    shields: 0,
    shieldRegen: 0,
    shieldDelay: 99,
    maxSpeed: 0,
    boostSpeed: 0,
    strafeSpeed: 0,
    accel: 0,
    pitchRate: 0,
    yawRate: 0,
    rollRate: 0,
    turnResponse: 1,
    energy: 100,
    energyRegen: 10,
    boostDrain: 0,
    gun: { damage: 0, cooldown: 99, boltSpeed: 1, energyCost: 0, range: 0 },
    missiles: 0,
    hitSpheres: [
      [0, 0, -42, 34],
      [0, 0, -14, 38],
      [0, 0, 14, 38],
      [0, 0, 42, 34],
    ],
    civilian: true,
    anchored: true,
    bounty: 0,
    price: 0,
  },
  brute: {
    id: 'brute',
    name: 'Wake Gunship "Mawbreaker"',
    model: 'brute',
    radius: 13,
    hull: 900,
    shields: 400,
    shieldRegen: 20,
    shieldDelay: 4,
    maxSpeed: 62,
    boostSpeed: 95,
    strafeSpeed: 10,
    accel: 1.0,
    pitchRate: 0.6,
    yawRate: 0.5,
    rollRate: 0.8,
    turnResponse: 3,
    energy: 200,
    energyRegen: 30,
    boostDrain: 20,
    gun: { damage: 8, cooldown: 0.12, boltSpeed: 600, energyCost: 1, range: 900, turretArc: 1.4 },
    missiles: 10,
    bounty: 5000,
    price: 0,
  },
  freighter: {
    id: 'freighter',
    name: 'Drift Bulk Hauler',
    model: 'freighter',
    radius: 30,
    hull: 5000,
    shields: 100000,
    shieldRegen: 1000,
    shieldDelay: 1,
    maxSpeed: 42,
    boostSpeed: 42,
    strafeSpeed: 0,
    accel: 0.5,
    pitchRate: 0.32,
    yawRate: 0.28,
    rollRate: 0.45,
    turnResponse: 1.5,
    energy: 100,
    energyRegen: 10,
    boostDrain: 0,
    gun: { damage: 0, cooldown: 99, boltSpeed: 1, energyCost: 0, range: 0 },
    missiles: 0,
    price: 0,
    hitSpheres: [
      [0, 0, -38, 9],
      [0, 0, -21, 11],
      [0, 0, -4, 11],
      [0, 0, 13, 11],
      [0, 0, 30, 11],
      [0, 0, 42, 9],
    ],
    civilian: true,
  },
};
