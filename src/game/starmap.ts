import type { FactionId } from '../entities/factions';
import type { Campaign } from './loadout';

/**
 * The Reach as a map: eight systems joined by jump gates. Each system is one of the game's
 * locations. Gates can be open, closed (to you, by whoever holds them) or temporary: opened for
 * one mission by a fleet's jump corridor, or by an invitation.
 */

export interface StarSystem {
  /** Same id as the location (world/locations.ts). */
  id: string;
  name: string;
  /** Position on the map, roughly -3..3. */
  x: number;
  y: number;
  /** Who holds the system, if anyone. */
  holder: FactionId | null;
  blurb: string;
}

export const SYSTEMS: StarSystem[] = [
  { id: 'kestrel', name: 'Kestrel', x: 0, y: 0, holder: 'kestrel', blurb: 'An independent station and its yards, at the crossroads of the Reach.' },
  { id: 'ashfall', name: 'The Ashfall', x: -1.5, y: 0.8, holder: null, blurb: 'A wreck field from an old war. Salvagers, smugglers and worse.' },
  { id: 'vantage', name: 'Vantage', x: 1.5, y: 0.7, holder: 'kestrel', blurb: 'A research station with the only dish array that reaches every station in the Reach.' },
  { id: 'gallows', name: 'The Gallows', x: -1.0, y: -1.3, holder: 'wake', blurb: 'The Red Wake\'s rig in the rocks. They keep their gate shut.' },
  { id: 'haven', name: 'Haven', x: -2.8, y: 1.7, holder: 'drift', blurb: 'The Drift Union\'s home: habitats and water tugs behind a wall of rock.' },
  { id: 'bastion', name: 'Bastion', x: 2.8, y: 1.6, holder: 'combine', blurb: 'The Helion Combine\'s fortress, behind a shield fed by four pylons.' },
  { id: 'saltmarket', name: 'Saltmarket', x: 1.4, y: -1.1, holder: 'patrol', blurb: 'The free port. Nobody owns it, everybody trades there, and the Reach Patrol keeps the peace.' },
  { id: 'rookery', name: 'The Rookery', x: 0.1, y: 2.3, holder: 'rose', blurb: 'A broken liner with a chapel on its back. Nobody finds it unless invited.' },
];

export interface Gate {
  a: string;
  b: string;
}

export const GATES: Gate[] = [
  { a: 'kestrel', b: 'ashfall' },
  { a: 'kestrel', b: 'vantage' },
  { a: 'kestrel', b: 'gallows' },
  { a: 'ashfall', b: 'haven' },
  { a: 'vantage', b: 'bastion' },
  { a: 'ashfall', b: 'rookery' },
  { a: 'kestrel', b: 'saltmarket' },
  { a: 'saltmarket', b: 'vantage' },
];

export type GateState = { state: 'open' } | { state: 'closed'; why: string } | { state: 'temporary'; why: string };

export const systemById = (id: string): StarSystem => SYSTEMS.find((s) => s.id === id) ?? SYSTEMS[0];

/**
 * Whether you can fly a gate. `bound` is the system a mission waits in: a gate closed to you
 * that leads there opens as a temporary corridor for that mission. `asylum` is the system you are
 * defecting to: its holders let you through.
 */
export function gateState(gate: Gate, c: Campaign, bound?: string, asylum?: string): GateState {
  const ends = [gate.a, gate.b];
  const touches = (id: string) => ends.includes(id);
  let closed: string | null = null;
  if (touches('gallows')) closed = 'The Red Wake keep this gate shut.';
  else if (touches('haven') && c.allegiance === 'combine') closed = 'Drift pickets turn Combine pilots away.';
  else if (touches('bastion') && c.allegiance === 'drift') closed = 'Combine control has flagged your transponder.';
  else if (touches('rookery')) closed = 'Nobody finds the Rookery unless invited.';
  if (!closed) return { state: 'open' };
  if (asylum && touches(asylum) && asylum !== 'gallows' && asylum !== 'rookery') return { state: 'temporary', why: 'They are letting you through to ask for asylum.' };
  if (bound && touches(bound)) return { state: 'temporary', why: bound === 'rookery' ? 'The Baron has sent you the way in.' : 'A fleet jump corridor is open for this mission.' };
  return { state: 'closed', why: closed };
}

/** The shortest chain of systems from `from` to `to` through gates you can fly, or null. */
export function route(c: Campaign, from: string, to: string, bound?: string, asylum?: string): string[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string>([[from, '']]);
  const queue = [from];
  while (queue.length) {
    const here = queue.shift() as string;
    for (const g of GATES) {
      const there = g.a === here ? g.b : g.b === here ? g.a : null;
      if (!there || prev.has(there) || gateState(g, c, bound, asylum).state === 'closed') continue;
      prev.set(there, here);
      if (there === to) {
        const path = [to];
        let p = here;
        while (p) {
          path.unshift(p);
          p = prev.get(p) ?? '';
        }
        return path;
      }
      queue.push(there);
    }
  }
  return null;
}

/** Where each side takes in defectors. */
export const HOMES: Record<'combine' | 'drift', string> = { combine: 'bastion', drift: 'haven' };
