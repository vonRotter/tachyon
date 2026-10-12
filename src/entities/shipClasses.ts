export type ModelId = 'kite' | 'lancer' | 'raider' | 'warden' | 'brute' | 'freighter';

export interface GunSpec {
  damage: number;
  cooldown: number; // seconds between shots (alternating hardpoints)
  boltSpeed: number;
  energyCost: number;
  range: number;
  /** Turret guns fire within this half-angle (radians) of the nose instead of straight ahead. */
  turretArc?: number;
}

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
  price: number;
  /** Compound collision for long hulls: local [x, y, z, radius] spheres. */
  hitSpheres?: [number, number, number, number][];
  /** Civilian traffic: never targeted, never shoots. */
  civilian?: boolean;
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
    yawRate: 1.6,
    rollRate: 3.4,
    turnResponse: 7,
    energy: 100,
    energyRegen: 16,
    boostDrain: 24,
    gun: { damage: 9, cooldown: 0.085, boltSpeed: 720, energyCost: 1.2, range: 900 },
    missiles: 8,
    price: 0,
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
    yawRate: 1.3,
    rollRate: 2.6,
    turnResponse: 6,
    energy: 120,
    energyRegen: 18,
    boostDrain: 26,
    gun: { damage: 14, cooldown: 0.11, boltSpeed: 680, energyCost: 1.6, range: 950 },
    missiles: 12,
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
    yawRate: 1.4,
    rollRate: 3.0,
    turnResponse: 6,
    energy: 100,
    energyRegen: 14,
    boostDrain: 22,
    gun: { damage: 6, cooldown: 0.16, boltSpeed: 620, energyCost: 1.5, range: 800 },
    missiles: 0,
    price: 18000,
  },
  warden: {
    id: 'warden',
    name: 'Kestrel Warden',
    model: 'warden',
    radius: 3.4,
    hull: 150,
    shields: 110,
    shieldRegen: 12,
    shieldDelay: 3,
    maxSpeed: 95,
    boostSpeed: 170,
    strafeSpeed: 25,
    accel: 2.0,
    pitchRate: 1.7,
    yawRate: 1.35,
    rollRate: 2.8,
    turnResponse: 6,
    energy: 100,
    energyRegen: 14,
    boostDrain: 22,
    gun: { damage: 7, cooldown: 0.14, boltSpeed: 650, energyCost: 1.4, range: 850 },
    missiles: 2,
    price: 26000,
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
