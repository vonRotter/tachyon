export type FactionId = 'player' | 'kestrel' | 'wake' | 'combine' | 'drift';

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
};

/** Mission-set overrides on top of the default: the Red Wake against everyone. */
const overrides = new Map<string, boolean>();
const pairKey = (a: FactionId, b: FactionId): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function hostile(a: FactionId, b: FactionId): boolean {
  if (a === b) return false;
  const o = overrides.get(pairKey(a, b));
  if (o !== undefined) return o;
  return (a === 'wake') !== (b === 'wake');
}

export function setHostile(a: FactionId, b: FactionId, value: boolean): void {
  overrides.set(pairKey(a, b), value);
}

export function resetRelations(): void {
  overrides.clear();
}
