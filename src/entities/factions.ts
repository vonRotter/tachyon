export type FactionId = 'player' | 'kestrel' | 'wake' | 'combine' | 'drift' | 'patrol' | 'rose';

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  canopy: string;
  engine: string;
  bolt: string;
}

export interface FactionInfo {
  id: FactionId;
  name: string;
  hudColor: string;
  palette: Palette;
}

export const FACTIONS: Record<FactionId, FactionInfo> = {
  player: {
    id: 'player',
    name: 'Independent',
    hudColor: '#4dfcd2',
    palette: {
      primary: '#16b5a5',
      secondary: '#f2e8d2',
      accent: '#ff8a1f',
      canopy: '#2ad8ff',
      engine: '#66d9ff',
      bolt: '#ffb347',
    },
  },
  kestrel: {
    id: 'kestrel',
    name: 'Kestrel Militia',
    hudColor: '#ffd84d',
    palette: {
      primary: '#f4b400',
      secondary: '#3047c4',
      accent: '#7fe9ff',
      canopy: '#7fe9ff',
      engine: '#9ef0ff',
      bolt: '#55e6ff',
    },
  },
  wake: {
    id: 'wake',
    name: 'Red Wake',
    hudColor: '#ff3b5c',
    palette: {
      primary: '#c0142f',
      secondary: '#26222e',
      accent: '#ffd030',
      canopy: '#ff6a2a',
      engine: '#ff5a3a',
      bolt: '#ff2f7a',
    },
  },
  combine: {
    id: 'combine',
    name: 'Helion Combine',
    hudColor: '#f6f0e0',
    palette: {
      primary: '#ece6da',
      secondary: '#e0a83c',
      accent: '#5fe8ff',
      canopy: '#5fe8ff',
      engine: '#8fd8ff',
      bolt: '#9fe8ff',
    },
  },
  drift: {
    id: 'drift',
    name: 'Drift Union',
    hudColor: '#9cff6a',
    palette: {
      primary: '#c46a2b',
      secondary: '#3c6e4a',
      accent: '#c6ff5a',
      canopy: '#c6ff5a',
      engine: '#ffb36a',
      bolt: '#b6ff4a',
    },
  },
  patrol: {
    id: 'patrol',
    name: 'Reach Patrol',
    hudColor: '#8fb8ff',
    palette: {
      primary: '#eef2f8',
      secondary: '#1d3f9e',
      accent: '#ff3348',
      canopy: '#7fc8ff',
      engine: '#a8c8ff',
      bolt: '#7fb0ff',
    },
  },
  rose: {
    id: 'rose',
    name: 'The Scarlet Baron',
    hudColor: '#c89bff',
    palette: {
      primary: '#b3122e',
      secondary: '#f2e8d2',
      accent: '#ffcf5a',
      canopy: '#ffd9a8',
      engine: '#ff8a6a',
      bolt: '#ff4d6d',
    },
  },
};

/**
 * Each shipyard builds to its own doctrine, and the doctrine shows in the silhouette. The idea
 * is borrowed from EVE Online's racial lines, where a ship's culture can be read from its
 * shape before its paint: armour where a faction trusts armour, shields where it trusts
 * shields, exposed frames where it builds from scrap.
 */
export interface FactionDesign {
  /** Shipyard name in the shop. */
  yard: string;
  /** One-line design principle. */
  principle: string;
  /** What the yard's ships are good and bad at. */
  doctrine: string;
  /** Paint a player-owned hull keeps from its yard (the player's teal stays as the main coat). */
  livery: Partial<Palette>;
}

export const FACTION_DESIGN: Partial<Record<FactionId, FactionDesign>> = {
  kestrel: {
    yard: 'Independent yards',
    principle: 'Workhorses. Rounded nacelles, rings and hoops, bright paint, parts that bolt on and off.',
    doctrine: 'Balanced and forgiving. Nothing exceptional, nothing missing. Sold to anyone with credits.',
    livery: {},
  },
  combine: {
    yard: 'Helion Combine yards',
    principle: 'Polished authority. Symmetry, long bevelled wedges, crescent blades, ivory and gold.',
    doctrine: 'Strong shields that recharge fast, deep energy reserves, long-range guns. Thin hulls and few missiles.',
    livery: { secondary: '#ece6da', accent: '#e0a83c' },
  },
  drift: {
    yard: 'Drift Union salvage docks',
    principle: 'Built from what is left. Asymmetric, exposed frames and rings, bolted-on pods, mismatched plates.',
    doctrine: 'Heavy armour, deep magazines, many hardpoints. Weak shields and sluggish recharge.',
    livery: { secondary: '#c46a2b', accent: '#c6ff5a', engine: '#ffb36a' },
  },
  wake: {
    yard: 'Red Wake chop shops',
    principle: 'Teeth. Hooked blades, forward fangs, lopsided silhouettes, crimson over black.',
    doctrine: 'Speed and close-range punch. Hard-hitting short guns, little protection.',
    livery: { secondary: '#c0142f', accent: '#ffd030', engine: '#ff5a3a' },
  },
  rose: {
    yard: 'The Baron\'s hangar',
    principle: 'Gallantry with a crooked smile. Lopsided X-wings with pods at the tips, a long elegant nose, crimson and cream with a gold rose.',
    doctrine: 'The best-turning hulls in the Reach, built for one pilot\'s idea of a fair fight. Never sold: given, if at all.',
    livery: { primary: '#b3122e', secondary: '#f2e8d2', accent: '#ffcf5a' },
  },
  patrol: {
    yard: 'Reach Patrol',
    principle: 'Visible authority. Broad, symmetric, high-visibility white with lightbars you can see from a kilometre out.',
    doctrine: 'Tough all-rounders built to run down and hold anyone. Never sold: the Patrol does not let its hulls leave service.',
    livery: { secondary: '#1d3f9e', accent: '#ff3348' },
  },
};

/**
 * The paint a ship wears. Faction ships wear their faction's colours; the player's ships keep the
 * player's main coat with the trim of the yard that built them.
 */
export function shipPalette(faction: FactionId, maker?: FactionId): { palette: Palette; key: string } {
  if (faction !== 'player' || !maker || maker === 'kestrel') return { palette: FACTIONS[faction].palette, key: faction };
  return { palette: { ...FACTIONS.player.palette, ...(FACTION_DESIGN[maker]?.livery ?? {}) }, key: `player-${maker}` };
}

/**
 * Who is fighting whom, as a lookup table: the default (the Red Wake against everyone) with
 * mission-set overrides on top. `hostile` runs for every bolt against every ship each physics
 * step, so it must be a couple of array reads, not a string key and a map lookup.
 */
const FACTION_IDS = Object.keys(FACTIONS) as FactionId[];
const FACTION_COUNT = FACTION_IDS.length;
const FACTION_INDEX = Object.fromEntries(FACTION_IDS.map((f, i) => [f, i])) as Record<FactionId, number>;
const relations = new Uint8Array(FACTION_COUNT * FACTION_COUNT);

function setPair(a: FactionId, b: FactionId, value: boolean): void {
  const ia = FACTION_INDEX[a];
  const ib = FACTION_INDEX[b];
  const v = a !== b && value ? 1 : 0;
  relations[ia * FACTION_COUNT + ib] = v;
  relations[ib * FACTION_COUNT + ia] = v;
}

export function hostile(a: FactionId, b: FactionId): boolean {
  return relations[FACTION_INDEX[a] * FACTION_COUNT + FACTION_INDEX[b]] === 1;
}

export function setHostile(a: FactionId, b: FactionId, value: boolean): void {
  setPair(a, b, value);
}

export function resetRelations(): void {
  for (const a of FACTION_IDS) for (const b of FACTION_IDS) setPair(a, b, (a === 'wake') !== (b === 'wake'));
}
resetRelations();
