import * as THREE from 'three';
import { clamp, interceptTime, rand } from '../core/math';
import { makeRayHit, type CollisionWorld } from '../world/colliders';
import { hostile } from './factions';
import type { Ship } from './ship';
import type { MissileSystem } from './weapons';

export interface AIContext {
  world: CollisionWorld;
  ships: Ship[];
  missiles: MissileSystem;
  dropFlare(ship: Ship): void;
}

const _rel = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _vdir = new THREE.Vector3();
const _inv = new THREE.Quaternion();
const hit = makeRayHit();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

type State = 'attack' | 'evade' | 'extend' | 'patrol';

/**
 * How a pilot fights:
 * - swarm: close in and turn-fight at knife range (the Red Wake)
 * - standoff: shoot from long range and break away before the target can close (Combine)
 * - flanker: work round to the target's side or tail before committing (Drift)
 */
export type Tactic = 'swarm' | 'standoff' | 'flanker';

export const FACTION_TACTICS: Partial<Record<string, Tactic>> = { wake: 'swarm', combine: 'standoff', drift: 'flanker', kestrel: 'swarm' };

/**
 * AI pilot: pursuit with lead, evasive jinks, overshoot extension and sphere-cast obstacle
 * avoidance. It flies through the same geometry under the same flight model as the player, so
 * dragging it through a lattice tower is a legitimate way to shake it.
 */
export class AIPilot {
  state: State = 'attack';
  private stateTimer = 0;
  private retargetTimer = 0;
  private losTimer = 0;
  private hasLOS = true;
  private readonly lastSeen = new THREE.Vector3();
  private readonly jinkDir = new THREE.Vector3();
  private jinkTimer = 0;
  private aimHold = 0;
  private reactedTo = -1;
  /** Bias towards attacking the player (0..1). */
  playerBias = 0.5;
  /** Scripted target that overrides normal target selection while it lives. */
  forcedTarget: Ship | null = null;
  tactic: Tactic = 'swarm';
  /** Flankers pick a side of the target to come in from. */
  private readonly flankSide = Math.random() < 0.5 ? -1 : 1;
  /** Optional anchor; with no hostiles the pilot circles it. */
  readonly patrolPoint = new THREE.Vector3();
  /** Wingman: fly formation on this ship, take its target, and never stray far from it. */
  wingOf: Ship | null = null;
  leash = 1400;

  constructor(
    private readonly ctx: AIContext,
    readonly skill: number,
  ) {}

  private pickTarget(ship: Ship): Ship | null {
    if (this.forcedTarget?.alive) return this.forcedTarget;
    const lead = this.wingOf?.alive ? this.wingOf : null;
    if (lead?.target?.alive && hostile(ship.faction, lead.target.faction)) return lead.target;
    let best: Ship | null = null;
    let bestScore = Infinity;
    for (const s of this.ctx.ships) {
      // capital ship engines, hangars and bridges are for the player to go after
      if (!s.alive || s.cls.civilian || s.cls.subsystem || !hostile(ship.faction, s.faction)) continue;
      // escorts are defensive: the leader's target, or whatever is shooting at the pair of them
      if (lead && (s.pos.distanceToSquared(lead.pos) > this.leash * this.leash || (s.target !== lead && s.target !== ship))) continue;
      let score = s.pos.distanceTo(ship.pos);
      if (s.isPlayer) score *= 1 - this.playerBias * 0.6;
      if (s === ship.lastAttacker) score *= 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  update(ship: Ship, dt: number): void {
    const c = ship.controls;
    const cls = ship.cls;
    c.fire = false;
    c.missile = false;
    c.slide = false;
    c.strafeX = 0;
    c.strafeY = 0;

    this.retargetTimer -= dt;
    if (!ship.target || !ship.target.alive || this.retargetTimer <= 0 || (this.forcedTarget?.alive && ship.target !== this.forcedTarget)) {
      ship.target = this.pickTarget(ship);
      this.retargetTimer = rand(4, 8);
      this.hasLOS = true;
      if (ship.target) this.lastSeen.copy(ship.target.pos);
    }
    const tt = ship.target as Ship | null;
    if (tt && this.wingOf?.alive && tt !== this.wingOf.target && tt.pos.distanceToSquared(this.wingOf.pos) > this.leash * this.leash) {
      // the fight drifted off: back to the leader
      ship.target = null;
      this.retargetTimer = 2;
    }
    const t = ship.target;
    ship.forward(_fwd);
    let throttle = 0.85;
    let boost = false;

    // incoming missiles trigger evasive action
    const threats = this.ctx.missiles.incoming(ship);
    if (threats.length && this.state !== 'evade' && Math.random() < dt * (1 + this.skill * 2)) {
      this.enterEvade(ship, threats[0].pos);
    }
    // pilots carrying flares pop one when a missile gets close, better pilots closer to impact
    if (ship.flares > 0 && threats.some((m) => m.pos.distanceToSquared(ship.pos) < (260 - this.skill * 120) ** 2) && Math.random() < dt * 4) {
      this.ctx.dropFlare(ship);
    }

    if (this.stateTimer > 0) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.state = 'attack';
    }

    if (!t && this.wingOf?.alive) {
      this.state = 'patrol';
      const lead = this.wingOf;
      lead.forward(_tmp);
      _desired
        .copy(lead.pos)
        .addScaledVector(_tmp, -40)
        .add(_tmp2.set(this.flankSide * 30, 8, 0).applyQuaternion(lead.quat))
        .sub(ship.pos);
      const d = _desired.length();
      if (d < 50) _desired.addScaledVector(_tmp, 60);
      _desired.normalize();
      throttle = clamp(lead.speed / ship.cls.maxSpeed + (d - 50) / 150, 0.15, 1);
      boost = d > 500;
    } else if (!t) {
      this.state = 'patrol';
      _desired.subVectors(this.patrolPoint, ship.pos);
      const d = _desired.length();
      if (d < 300) _desired.cross(WORLD_UP).add(_tmp.copy(_fwd).multiplyScalar(d * 0.3));
      _desired.normalize();
      throttle = 0.6;
    } else {
      _rel.subVectors(t.pos, ship.pos);
      const dist = _rel.length();
      this.losTimer -= dt;
      if (this.losTimer <= 0) {
        this.losTimer = 0.25;
        this.hasLOS = this.ctx.world.lineOfSight(ship.pos, t.pos, hit);
      }
      if (this.hasLOS) this.lastSeen.copy(t.pos);

      // lead the target for gunnery
      _tmp.subVectors(t.vel, ship.vel);
      const ti = interceptTime(_rel, _tmp, cls.gun.boltSpeed);
      _aim.copy(t.pos).addScaledVector(t.vel, ti > 0 ? ti : 0).addScaledVector(ship.vel, -(ti > 0 ? ti : 0));
      _aim.sub(ship.pos);
      const aimDist = _aim.length();
      _aim.divideScalar(Math.max(aimDist, 1e-3));

      // reactions
      // one roll per hit: weaker pilots break off more readily
      if (ship.lastDamageTime !== this.reactedTo && ship.age - ship.lastDamageTime < 0.3) {
        this.reactedTo = ship.lastDamageTime;
        if (this.state === 'attack' && Math.random() < 0.12 * (1.3 - this.skill)) {
          this.enterEvade(ship, ship.lastAttacker ? ship.lastAttacker.pos : t.pos);
        }
      }
      // break-off distance: swarmers pass at knife range, standoff pilots never let you close
      const breakAt = this.tactic === 'standoff' && !t.cls.anchored ? 420 + this.skill * 120 : 45 + ship.radius * 3;
      if (this.state === 'attack' && dist < breakAt && _fwd.dot(_rel) > 0) {
        this.state = 'extend';
        if (this.tactic === 'standoff') {
          // run out wide and come round again for another long-range pass
          this.stateTimer = rand(2.2, 3.2);
          _tmp2.crossVectors(_rel, WORLD_UP).normalize().multiplyScalar(this.flankSide);
          this.jinkDir.copy(_rel).normalize().negate().addScaledVector(_tmp2, 1.2).normalize();
        } else {
          this.stateTimer = rand(1.4, 2.4);
          this.jinkDir.copy(_fwd).addScaledVector(_tmp.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)), 0.8).normalize();
        }
      }

      if (this.state === 'evade') {
        this.jinkTimer -= dt;
        if (this.jinkTimer <= 0) {
          this.jinkTimer = rand(0.5, 1.0);
          _tmp.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
          this.jinkDir.copy(_fwd).multiplyScalar(0.6).add(_tmp).normalize();
        }
        _desired.copy(this.jinkDir);
        boost = ship.energy > 25;
        throttle = 1;
      } else if (this.state === 'extend') {
        _desired.copy(this.jinkDir);
        boost = ship.energy > 35;
        throttle = 1;
      } else {
        this.state = 'attack';
        if (this.hasLOS) _desired.copy(_aim);
        else _desired.subVectors(this.lastSeen, ship.pos).normalize();
        if (this.tactic === 'flanker' && dist > 420 && !t.cls.anchored) {
          // aim for a point off the target's flank and behind it, then turn in
          t.forward(_tmp);
          _tmp2.crossVectors(_tmp, WORLD_UP).normalize().multiplyScalar(this.flankSide * 260);
          _desired.copy(t.pos).addScaledVector(_tmp, -220).add(_tmp2).sub(ship.pos).normalize();
        }
        const facing = _fwd.dot(_aim);
        const angle = Math.acos(clamp(facing, -1, 1));
        if (dist > 700) boost = ship.energy > 40;
        if (angle > 1.0) throttle = 0.55; // cut speed to tighten the turn
        else if (dist < 260 && facing > 0.7) throttle = clamp(t.speed / cls.maxSpeed + 0.05, 0.35, 1);
        else throttle = 1;
        // standoff pilots ease off once in range, to stay out there and keep shooting
        if (this.tactic === 'standoff' && angle < 0.5 && !t.cls.anchored) {
          // hold station about two thirds of gun range out: match the target's speed, plus a
          // little to close the gap or minus a little to open it
          const want = cls.gun.range * 0.7;
          throttle = clamp(t.speed / cls.maxSpeed + ((dist - want) / 400) * 0.35, 0.15, 1);
        }

        // gunnery: cone covers the target's angular size plus some slop for weaker pilots
        const cone =
          cls.gun.turretArc ?? Math.max(0.05, Math.atan((t.radius * 2.2) / Math.max(dist, 1))) + (1 - this.skill) * 0.04;
        if (angle < cone && dist < cls.gun.range && this.hasLOS) {
          this.aimHold += dt;
          if (this.aimHold > 0.18 - this.skill * 0.12) c.fire = true;
        } else this.aimHold = Math.max(0, this.aimHold - dt * 2);

        if (
          ship.missiles > 0 &&
          ship.missileTimer <= 0 &&
          angle < 0.3 &&
          dist > 250 &&
          dist < 1300 &&
          this.hasLOS &&
          Math.random() < dt * 0.35
        ) {
          c.missile = true;
          ship.missileTimer = rand(5, 9);
        }
      }
    }

    const avoidance = this.avoid(ship, _desired);
    if (avoidance > 0) {
      throttle *= 1 - avoidance * (0.25 + this.skill * 0.35);
      if (avoidance > 0.35) boost = false;
    }
    this.separate(ship, _desired);

    c.throttle = throttle;
    c.boost = boost;
    this.steer(ship, _desired);
  }

  private enterEvade(ship: Ship, threat: THREE.Vector3): void {
    this.state = 'evade';
    this.stateTimer = rand(1.2, 2.4);
    this.jinkTimer = 0;
    _tmp2.subVectors(ship.pos, threat).normalize();
    this.jinkDir.copy(_tmp2);
  }

  /** Bends `desired` around obstacles; returns urgency 0..1. */
  private avoid(ship: Ship, desired: THREE.Vector3): number {
    const world = this.ctx.world;
    const speed = Math.max(ship.speed, 30);
    const look = clamp(speed * 1.9, 70, 340);
    const inflate = ship.radius + 5;
    if (ship.speed > 5) _vdir.copy(ship.vel).normalize();
    else ship.forward(_vdir);
    let urgency = 0;
    if (world.raycast(ship.pos, _vdir, look, inflate, hit)) {
      urgency = 1 - hit.t / look;
    } else if (world.raycast(ship.pos, desired, look * 0.7, inflate, hit)) {
      urgency = (1 - hit.t / (look * 0.7)) * 0.6;
    } else return 0;

    const n = hit.normal;
    _tmp.copy(desired).addScaledVector(n, -desired.dot(n));
    if (_tmp.lengthSq() < 0.01) {
      _tmp.crossVectors(n, WORLD_UP);
      if (_tmp.lengthSq() < 0.01) _tmp.set(1, 0, 0);
    }
    _tmp.normalize().addScaledVector(n, 0.35 + urgency * 1.3).normalize();
    desired.lerp(_tmp, clamp(0.45 + urgency, 0, 1)).normalize();
    return urgency;
  }

  private separate(ship: Ship, desired: THREE.Vector3): void {
    for (const o of this.ctx.ships) {
      if (o === ship || !o.alive || o.cls.subsystem) continue;
      _tmp.subVectors(ship.pos, o.pos);
      const d = _tmp.length();
      const min = ship.radius + o.radius + 22;
      if (d < min && d > 1e-3) desired.addScaledVector(_tmp.divideScalar(d), (1 - d / min) * 1.2);
    }
    desired.normalize();
  }

  private steer(ship: Ship, desired: THREE.Vector3): void {
    steerTowards(ship, desired, this.skill);
  }

}

/** PD steering from a desired world direction to pitch/yaw/roll controls, with bank-to-turn. */
export function steerTowards(ship: Ship, desired: THREE.Vector3, skill: number): void {
  const c = ship.controls;
  _inv.copy(ship.quat).invert();
  const local = _tmp.copy(desired).applyQuaternion(_inv);
  const pitchErr = Math.atan2(local.y, -local.z);
  const yawErr = Math.atan2(local.x, -local.z);
  const gain = 2.2 + skill * 1.6;
  // the rate term stops the nose overshooting the aim point
  const damping = 0.25 + skill * 0.2;
  c.pitch = clamp(pitchErr * gain - (ship.angVel.x / ship.cls.pitchRate) * damping, -1, 1);
  c.yaw = clamp(yawErr * gain + (ship.angVel.y / ship.cls.yawRate) * damping, -1, 1);
  const off = Math.atan2(Math.hypot(local.x, local.y), -local.z);
  if (off > 0.2) {
    const rollErr = Math.atan2(local.x, Math.abs(local.y) + 1e-3);
    c.roll = clamp(rollErr * 1.6, -1, 1) * clamp((off - 0.2) * 2.5, 0, 1);
  } else {
    // drift back towards level flight so formations look intentional
    ship.right(_tmp2);
    c.roll = clamp(_tmp2.y * 1.5, -0.4, 0.4);
  }
}

/** Civilian traffic: loops through waypoints at a steady cruise and never fights. */
export class WaypointPilot {
  private index = 0;

  constructor(
    private readonly points: THREE.Vector3[],
    private readonly cruise = 0.85,
  ) {}

  update(ship: Ship, dt: number): void {
    void dt;
    const c = ship.controls;
    c.fire = false;
    c.missile = false;
    c.boost = false;
    c.slide = false;
    let target = this.points[this.index];
    if (ship.pos.distanceTo(target) < 160) {
      this.index = (this.index + 1) % this.points.length;
      target = this.points[this.index];
    }
    _desired.subVectors(target, ship.pos).normalize();
    c.throttle = this.cruise;
    steerTowards(ship, _desired, 0.4);
  }
}

/**
 * One-way route for convoys: flies the points in order, can be told to hold, and stops at the
 * last point. `done` turns true on arrival.
 */
export class RoutePilot {
  private index = 0;
  hold = false;
  done = false;

  constructor(
    private readonly points: THREE.Vector3[],
    private readonly cruise = 0.6,
    private readonly reach = 60,
  ) {}

  /** Fraction of the route covered, by waypoint. */
  get progress(): number {
    return this.done ? 1 : this.index / this.points.length;
  }

  update(ship: Ship, dt: number): void {
    void dt;
    const c = ship.controls;
    c.fire = false;
    c.missile = false;
    c.boost = false;
    c.slide = false;
    const target = this.points[this.index];
    if (!this.done && ship.pos.distanceTo(target) < this.reach) {
      if (this.index < this.points.length - 1) this.index++;
      else this.done = true;
    }
    c.throttle = this.hold || this.done ? 0 : this.cruise;
    _desired.subVectors(this.points[this.index], ship.pos).normalize();
    steerTowards(ship, _desired, 0.4);
  }
}

/**
 * Fixed gun emplacement: swings towards the nearest hostile in range (leading it) at a limited
 * slew rate and fires when roughly on target with a clear line of fire.
 */
export class TurretAI {
  private retarget = 0;
  private readonly aim = new THREE.Vector3();
  private readonly look = new THREE.Matrix4();
  private readonly qTarget = new THREE.Quaternion();
  private losTimer = 0;
  private losTarget: Ship | null = null;
  private losBlocked = false;

  constructor(
    private readonly ctx: AIContext,
    readonly skill = 0.5,
    /** Extra preference for shooting at the player (0..1). */
    readonly playerBias = 0.4,
  ) {}

  update(ship: Ship, dt: number): void {
    const c = ship.controls;
    c.fire = false;
    c.missile = false;
    this.retarget -= dt;
    const range = ship.cls.gun.range;
    if (!ship.target || !ship.target.alive || this.retarget <= 0 || ship.target.pos.distanceTo(ship.pos) > range * 1.2) {
      this.retarget = rand(1.5, 3);
      let best: Ship | null = null;
      let bestScore = Infinity;
      for (const s of this.ctx.ships) {
        if (!s.alive || s.cls.civilian || s.cls.anchored || !hostile(ship.faction, s.faction)) continue;
        let score = s.pos.distanceTo(ship.pos);
        if (score > range * 1.2) continue;
        if (s.isPlayer) score *= 1 - this.playerBias * 0.6;
        if (score < bestScore) {
          bestScore = score;
          best = s;
        }
      }
      ship.target = best;
    }
    const t = ship.target;
    if (!t) return;
    _rel.subVectors(t.pos, ship.pos);
    const ti = interceptTime(_rel, _tmp.subVectors(t.vel, ship.vel), ship.cls.gun.boltSpeed);
    this.aim.copy(t.pos).addScaledVector(t.vel, Math.max(0, ti));
    // ships fly along -Z; lookAt(eye, target) points -Z from the eye at the target
    this.look.lookAt(ship.pos, this.aim, WORLD_UP);
    this.qTarget.setFromRotationMatrix(this.look);
    const angle = ship.quat.angleTo(this.qTarget);
    const slew = (0.7 + this.skill * 0.8) * dt;
    ship.quat.rotateTowards(this.qTarget, slew);
    if (angle < 0.12 && _rel.length() < range) {
      this.losTimer -= dt;
      if (this.losTimer <= 0 || this.losTarget !== t) {
        this.losTimer = 0.2;
        this.losTarget = t;
        _vdir.copy(_rel).normalize();
        _tmp2.copy(ship.pos).addScaledVector(_vdir, ship.radius + 4);
        this.losBlocked = this.ctx.world.raycast(_tmp2, _vdir, _rel.length() - t.radius - ship.radius - 4, 0.5, hit);
      }
      c.fire = !this.losBlocked;
    }
  }
}
