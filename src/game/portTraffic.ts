import * as THREE from 'three';
import type { Game } from './game';
import type { Ship } from '../entities/ship';
import { AIPilot, steerTowards } from '../entities/ai';
import { FACTIONS, hostile, type FactionId } from '../entities/factions';
import { clamp } from '../core/math';
import type { PortBay, PortSpec } from '../world/structures';

const _d = new THREE.Vector3();
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/**
 * Flies a traffic lane: the points in order, easing off for the last one. Lane ships are guided
 * by the port's traffic computer (Ship.ghost), so they never scrape the bay walls.
 */
class LanePilot {
  private index = 0;
  done = false;

  constructor(
    private readonly points: THREE.Vector3[],
    private readonly cruise: number,
    private readonly ease = 260,
  ) {}

  update(ship: Ship, dt: number): void {
    void dt;
    const c = ship.controls;
    c.fire = false;
    c.missile = false;
    c.boost = false;
    c.slide = false;
    const last = this.index === this.points.length - 1;
    const d = ship.pos.distanceTo(this.points[this.index]);
    if (!last && d < Math.max(40, ship.speed * 1.5)) this.index++;
    else if (last && d < 14) this.done = true;
    const target = this.points[this.index];
    c.throttle = this.done ? 0 : last ? this.cruise * clamp(d / this.ease, 0.15, 1) : this.cruise;
    steerTowards(ship, _d.subVectors(target, ship.pos).normalize(), 0.7);
  }
}

interface Lane {
  ship: Ship;
  pilot: LanePilot;
  bay: PortBay | null;
  /** Arrivals land and are gone; departures jump out at the end of the lane. */
  arriving: boolean;
}

const SHUTTLES = ['Ferris', 'Calloway', 'Hesper', 'Marten', 'Quayside', 'Tuppence', 'Wicket', 'Osprey', 'Bellwether', 'Penny Black'];
const HAULERS = ['Ostrava', 'Long Haul', 'Small Mercy', 'Gristle', 'Heavy Weather', 'Stoneboat', 'Old Faithful', 'Tallow', 'Brine', 'Second Wind'];
const MINERS = ['Pick', 'Grindstone', 'Ore Mother', 'Slag Hen', 'Chisel'];

/**
 * A working port: ships launching from and landing in the bays all the time, big ships moored at
 * the piers, the port's guns, and Reach Patrol flights on their circuits. While the port is
 * orderly the Patrol keeps the rules: slow down in the bay lanes, guns cold. When trouble comes
 * (`panic`), arrivals turn back, every bay launches and the moored ships cast off and run.
 */
export class PortTraffic {
  readonly batteries: Ship[] = [];
  readonly guns: Ship[] = [];
  readonly patrols: Ship[] = [];
  readonly moored: Ship[] = [];
  /** The Patrol enforces the rules while this is set. */
  orderly = true;
  /** Bays traffic leaves alone (the one the player has been sent to). */
  readonly reserved = new Set<number>();
  private readonly lanes: Lane[] = [];
  private readonly busy = new Set<number>();
  private nextArrival = 0;
  private nextDeparture = 0;
  private panicUntil = -1;
  private panicked = false;
  private warnedSpeed = -999;
  private warnedGuns = -999;
  private speedWarnings = 0;
  /** Moored ships waiting their turn to leave the piers. */
  private readonly castOff: { ship: Ship; at: number }[] = [];
  private readonly circuits: { ship: Ship; route: THREE.Vector3[]; i: number }[] = [];

  constructor(
    private readonly g: Game,
    private readonly spec: PortSpec,
  ) {
    for (const p of spec.batteries) this.batteries.push(g.spawnShip('cannon', 'patrol', 'Saltmarket battery', p.clone(), p.clone().multiplyScalar(2), { turret: true, skill: 0.5, playerBias: 0.4 }));
    for (const p of spec.guns) this.guns.push(g.spawnShip('turret', 'patrol', 'Saltmarket gun', p.clone(), p.clone().multiplyScalar(2), { turret: true, skill: 0.5, playerBias: 0.4 }));
    for (const m of spec.moorings) {
      const s = g.spawnShip(m.cls, m.cls === 'container' ? 'drift' : 'combine', m.name, m.pos.clone(), m.look, { speed: 0 });
      s.invulnerable = true;
      s.ghost = true;
      s.held = true;
      this.moored.push(s);
    }
    const flights: [string, string][][] = [
      [
        ['interdictor', 'Interdictor 7'],
        ['interdictor', 'Interdictor 8'],
      ],
      [
        ['talon', 'Talon 2'],
        ['talon', 'Talon 3'],
      ],
      [
        ['interdictor', 'Interdictor 4'],
        ['warrant', 'Warrant Steadfast'],
      ],
    ];
    spec.patrols.forEach((route, f) => {
      const at = route[0];
      const lead = flights[f % flights.length];
      lead.forEach(([cls, name], j) => {
        const p = at.clone().add(new THREE.Vector3(j * 50, j * 12, j * 40));
        const s = g.spawnShip(cls, 'patrol', name, p, route[1], { skill: 0.65, playerBias: 0.3, damageScale: 0.6 });
        if (j > 0 && s.ai instanceof AIPilot) s.ai.wingOf = this.patrols[this.patrols.length - 1];
        this.patrols.push(s);
        this.circuits.push({ ship: s, route, i: 1 });
      });
    });
    // the port is already busy when you arrive
    const busy = g.trafficScale;
    for (let i = 0; i < Math.round(7 * busy); i++) this.arrive(rand(0.15, 0.85));
    for (let i = 0; i < Math.round(4 * busy); i++) this.depart(rand(0.1, 0.7));
    this.nextArrival = g.missionTime + rand(2, 4);
    this.nextDeparture = g.missionTime + rand(3, 6);
  }

  /** A bay by the number painted on it. */
  bay(number: number): PortBay {
    return this.spec.bays.find((b) => b.number === number) ?? this.spec.bays[0];
  }

  get bays(): PortBay[] {
    return this.spec.bays;
  }

  /** Bays with nothing on their lane. */
  private freeBay(): PortBay | null {
    const p = this.g.player;
    const free = this.spec.bays.filter((b) => !this.busy.has(b.number) && !this.reserved.has(b.number) && (!p || p.pos.distanceToSquared(b.mouth) > 250 * 250));
    return free.length ? pick(free) : null;
  }

  private civilian(): { cls: string; faction: FactionId; name: string } {
    const r = Math.random();
    if (r < 0.55) return { cls: 'shuttle', faction: Math.random() < 0.5 ? 'combine' : 'kestrel', name: `Shuttle ${pick(SHUTTLES)} ${1 + Math.floor(Math.random() * 9)}` };
    if (r < 0.85) return { cls: 'freighter', faction: 'drift', name: `Bulk Hauler ${pick(HAULERS)}` };
    return { cls: 'miner', faction: 'drift', name: `Ore cutter ${pick(MINERS)}` };
  }

  /** A ship coming in from the jump lanes to a bay; `progress` > 0 starts it partway in. */
  private arrive(progress = 0): void {
    const bay = this.freeBay();
    if (!bay) return;
    const side = new THREE.Vector3().crossVectors(bay.out, new THREE.Vector3(0, 1, 0)).normalize();
    const far = bay.mouth.clone().addScaledVector(bay.out, rand(2300, 2700)).addScaledVector(side, rand(-120, 120)).add(new THREE.Vector3(0, rand(-60, 60), 0));
    const lineup = bay.mouth.clone().addScaledVector(bay.out, 320);
    const points = [lineup, bay.mouth.clone().addScaledVector(bay.out, 30), bay.pad.clone()];
    const at = far.clone().lerp(lineup, progress);
    const c = this.civilian();
    const ship = this.g.spawnShip(c.cls, c.faction, c.name, at, lineup, { speed: 0 });
    ship.placeAt(at, lineup, ship.cls.maxSpeed * 0.7);
    if (progress === 0) this.flash(ship, at, bay.out.clone().negate());
    this.launch(ship, new LanePilot(points, 0.8), bay, true);
  }

  /** A ship lifting off a pad and heading out to jump. */
  private depart(progress = 0): void {
    const bay = this.freeBay();
    if (!bay) return;
    const side = new THREE.Vector3().crossVectors(bay.out, new THREE.Vector3(0, 1, 0)).normalize();
    const exit = bay.mouth.clone().addScaledVector(bay.out, rand(1700, 2100)).addScaledVector(side, rand(-140, 140)).add(new THREE.Vector3(0, rand(-80, 80), 0));
    const points = [bay.mouth.clone().addScaledVector(bay.out, 40), bay.mouth.clone().addScaledVector(bay.out, 400), exit];
    const c = this.civilian();
    const start = progress > 0 ? bay.mouth.clone().addScaledVector(bay.out, 400).lerp(exit, progress) : bay.pad.clone();
    const ship = this.g.spawnShip(c.cls, c.faction, c.name, start, start.clone().add(bay.out), { speed: 0 });
    ship.placeAt(start, start.clone().add(bay.out), progress > 0 ? ship.cls.maxSpeed * 0.8 : 4);
    this.launch(ship, new LanePilot(progress > 0 ? [exit] : points, 0.85, 1), progress > 0 ? null : bay, false);
  }

  private launch(ship: Ship, pilot: LanePilot, bay: PortBay | null, arriving: boolean): void {
    ship.ai = pilot;
    ship.invulnerable = true;
    ship.ghost = true;
    if (bay) this.busy.add(bay.number);
    this.lanes.push({ ship, pilot, bay, arriving });
  }

  /** The jump flash, without the jump's sound: the lanes are always flashing somewhere. */
  private flash(ship: Ship, at: THREE.Vector3, dir: THREE.Vector3): void {
    this.g.fx.jumpIn(at, dir, FACTIONS[ship.faction].palette.engine);
  }

  private gone(lane: Lane): void {
    if (lane.bay) this.busy.delete(lane.bay.number);
    const s = lane.ship;
    if (!s.alive) return;
    if (!lane.arriving) this.flash(s, s.pos, s.forward(new THREE.Vector3()));
    s.alive = false;
    s.dispose(this.g.scene);
  }

  /**
   * Trouble: incoming ships turn back and jump, every bay that can launches for a while,
   * and the moored ships cast off and run. Traffic stays away until `calm`.
   */
  panic(): void {
    if (this.panicked) return;
    this.panicked = true;
    this.orderly = false;
    this.panicUntil = this.g.missionTime + 24;
    const fleeing: Ship[] = [];
    for (const lane of this.lanes) {
      if (!lane.arriving || !lane.ship.alive) continue;
      // anything already inside a bay keeps going and lands
      if (lane.bay && lane.ship.pos.distanceTo(lane.bay.mouth) < 200) continue;
      if (lane.bay) this.busy.delete(lane.bay.number);
      lane.bay = null;
      fleeing.push(lane.ship);
    }
    for (const s of fleeing) this.lanes.splice(this.lanes.findIndex((l) => l.ship === s), 1);
    this.g.retreat(fleeing);
    this.moored.forEach((ship, i) => this.castOff.push({ ship, at: this.g.missionTime + 2 + i * 1.5 }));
    this.moored.length = 0;
    this.nextDeparture = this.g.missionTime + 1;
  }

  /** Back to business: traffic resumes (the rules too). */
  calm(): void {
    this.panicked = false;
    this.orderly = true;
    this.nextArrival = this.g.missionTime + 6;
    this.nextDeparture = this.g.missionTime + 10;
  }

  update(dt: number): void {
    void dt;
    const g = this.g;
    const t = g.missionTime;
    for (let i = this.lanes.length - 1; i >= 0; i--) {
      const lane = this.lanes[i];
      if (!lane.ship.alive || lane.pilot.done) {
        this.gone(lane);
        this.lanes.splice(i, 1);
      }
    }
    while (this.castOff.length && t > this.castOff[0].at) {
      const s = (this.castOff.shift() as { ship: Ship }).ship;
      if (!s.alive) continue;
      const out = s.forward(new THREE.Vector3());
      s.held = false;
      this.launch(s, new LanePilot([s.pos.clone().addScaledVector(out, 500), s.pos.clone().addScaledVector(out, 1800)], 0.9, 1), null, false);
    }
    if (!this.panicked && t > this.nextArrival) {
      this.arrive();
      this.nextArrival = t + rand(5, 9) / this.g.trafficScale;
    }
    const evacuating = this.panicked && t < this.panicUntil;
    if ((!this.panicked || evacuating) && t > this.nextDeparture) {
      this.depart();
      this.nextDeparture = t + (evacuating ? rand(2.5, 4) : rand(6, 10)) / this.g.trafficScale;
    }
    for (const c of this.circuits) {
      if (!c.ship.alive || !(c.ship.ai instanceof AIPilot)) continue;
      if (c.ship.pos.distanceToSquared(c.route[c.i]) < 330 * 330) c.i = (c.i + 1) % c.route.length;
      c.ship.ai.patrolPoint.copy(c.route[c.i]);
    }
    if (this.orderly) this.keepOrder(t);
  }

  /** The Patrol's rules, said over the radio: speed in the bay lanes, and guns. */
  private keepOrder(t: number): void {
    const p = this.g.player;
    if (!p?.alive || hostile('patrol', 'player')) return;
    const zone = this.spec.zone;
    if (p.pos.distanceTo(zone.center) > zone.radius) return;
    if (p.speed > zone.speedLimit + 8 && t - this.warnedSpeed > 25 && this.spec.bays.some((b) => b.mouth.distanceToSquared(p.pos) < 260 * 260)) {
      this.warnedSpeed = t;
      this.speedWarnings++;
      // literal lines, one call each, so the voice renderer finds them
      const said =
        this.speedWarnings === 1
          ? this.g.say('okafor', 'Pilot, Saltmarket Patrol. Slow it down in the bay lanes. Forty metres a second.')
          : this.speedWarnings === 2
            ? this.g.say('okafor', 'That is your second warning, pilot. There are people in those lanes.')
            : this.g.say('okafor', 'Do I have to come over there? Forty, pilot. Four, zero.');
      void said.catch(() => undefined);
    }
    if (p.controls.fire && t - this.warnedGuns > 30) {
      this.warnedGuns = t;
      void this.g.say('okafor', 'Guns cold inside five kilometres, pilot. Saltmarket is neutral ground, and the Patrol is watching.').catch(() => undefined);
    }
  }
}
