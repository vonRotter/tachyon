import * as THREE from 'three';
import { FACTIONS, hostile, type FactionId } from '../entities/factions';
import type { Ship } from '../entities/ship';
import type { CapitalShip } from '../entities/capitalShip';
import { CAPITAL_INFO } from '../world/capitals';

/**
 * The scanner: a look at everything in the system, separate from the combat target. It lists
 * ships, capital ships and stations alike, nearest first, with what is worth knowing about each.
 */

export interface Contact {
  /** Stable key so the selection survives a re-scan. */
  key: string;
  name: string;
  faction: FactionId | null;
  pos: THREE.Vector3;
  ship?: Ship;
  capital?: CapitalShip;
}

export interface ScanReadout {
  name: string;
  lines: string[];
  pos: THREE.Vector3;
  color: string;
  index: number;
  count: number;
}

/** Named landmarks of each location, by point prefix. */
const LANDMARKS: Record<string, string> = {
  'station.hub': 'Kestrel Station',
  'carrier.center': 'Sovereign Dawn (battlecruiser)',
  'gallows.center': 'The Gallows',
  'vantage.center': 'Vantage Station',
  'vantage.array': 'Vantage dish array',
  'haven.center': 'Haven',
  'bastion.center': 'Bastion',
  'bastion.drydock': 'Bastion drydock',
  'rookery.center': 'The Rookery',
  'ashfall.center': 'The Ashfall wreck field',
};

export function listContacts(
  player: Ship,
  ships: Ship[],
  capitals: CapitalShip[],
  points: Record<string, THREE.Vector3>,
): Contact[] {
  const out: Contact[] = [];
  for (const s of ships) {
    if (!s.alive || s === player) continue;
    out.push({ key: `ship:${s.id}`, name: s.name, faction: s.faction, pos: s.pos, ship: s });
  }
  for (const c of capitals) out.push({ key: `cap:${c.id}`, name: c.name, faction: c.faction, pos: c.root.position, capital: c });
  for (const [k, label] of Object.entries(LANDMARKS)) {
    const p = points[k];
    if (p) out.push({ key: `poi:${k}`, name: label, faction: null, pos: p });
  }
  return out.sort((a, b) => a.pos.distanceToSquared(player.pos) - b.pos.distanceToSquared(player.pos));
}

const pct = (v: number, max: number): string => `${Math.max(0, Math.round((v / Math.max(1, max)) * 100))}%`;

/** What the scanner says about a contact. */
export function readout(c: Contact, player: Ship, index: number, count: number): ScanReadout {
  const d = Math.round(c.pos.distanceTo(player.pos));
  const lines: string[] = [];
  let color = '#9fe8ff';
  if (c.ship) {
    const s = c.ship;
    const enemy = hostile('player', s.faction);
    const stance = s.cls.civilian ? 'Civilian' : enemy ? 'Hostile' : 'Not hostile';
    color = s.cls.civilian ? '#cfd6f0' : enemy ? '#ff5a6a' : '#7dff9a';
    lines.push(s.cls.anchored ? `${s.cls.name} · emplacement` : s.cls.name);
    lines.push(`${FACTIONS[s.faction].name} · ${stance}`);
    lines.push(`${d.toLocaleString('en-US')} m${s.cls.anchored ? '' : ` · ${Math.round(s.speed)} m/s`}`);
    lines.push(`Hull ${pct(s.hull, s.cls.hull)}${s.cls.shields > 0 && s.cls.shields < 10000 ? ` · Shields ${pct(s.shields, s.cls.shields)}` : ''}`);
    if (enemy && s.cls.bounty) lines.push(`Bounty ${s.cls.bounty.toLocaleString('en-US')} cr`);
    if (s.missiles > 0 && !s.cls.civilian) lines.push(`Missiles aboard: ${Math.floor(s.missiles)}`);
  } else if (c.capital) {
    const cap = c.capital;
    const info = CAPITAL_INFO[cap.kind];
    const enemy = c.faction ? hostile('player', c.faction) : false;
    color = enemy ? '#ff5a6a' : '#7dff9a';
    const guns = cap.turrets.filter((t) => t.ship.alive).length;
    lines.push(`${info.label} · about ${info.length} m`);
    lines.push(`${c.faction ? FACTIONS[c.faction].name : 'Unknown'} · ${enemy ? 'Hostile' : 'Not hostile'}`);
    lines.push(`${d.toLocaleString('en-US')} m${cap.speed ? ` · ${Math.round(cap.speed)} m/s` : ' · holding station'}`);
    lines.push(`Guns ${guns} of ${cap.turrets.length} · crew ${info.crew}`);
  } else {
    lines.push('Station or landmark');
    lines.push(`${d.toLocaleString('en-US')} m`);
  }
  return { name: c.name, lines, pos: c.pos, color, index, count };
}
