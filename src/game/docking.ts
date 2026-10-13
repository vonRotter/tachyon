import * as THREE from 'three';
import { clamp, dampFactor } from '../core/math';
import type { Ship } from '../entities/ship';
import type { DockSpec } from '../world/structures';
import { makeRayHit, type CollisionWorld } from '../world/colliders';
import { steerTowards } from '../entities/ai';

export type DockStage = 'idle' | 'approach' | 'entry' | 'landing' | 'docked';

export interface DockGuide {
  /** Next point to fly to. */
  marker: THREE.Vector3;
  label: string;
  distance: number;
  speedLimit: number;
  tooFast: boolean;
  stage: DockStage;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);

/** World-space frame of a dock (it may ride on a moving parent). */
interface Frame {
  pad: THREE.Vector3;
  outward: THREE.Vector3;
  up: THREE.Vector3;
}

function ringMesh(radiusX: number, radiusY: number, color: string): THREE.Mesh {
  const shape = new THREE.Shape();
  const w = radiusX;
  const h = radiusY;
  const t = 1.2;
  shape.moveTo(-w - t, -h - t);
  shape.lineTo(w + t, -h - t);
  shape.lineTo(w + t, h + t);
  shape.lineTo(-w - t, h + t);
  shape.lineTo(-w - t, -h - t);
  const hole = new THREE.Path();
  hole.moveTo(-w, -h);
  hole.lineTo(-w, h);
  hole.lineTo(w, h);
  hole.lineTo(w, -h);
  hole.lineTo(-w, -h);
  shape.holes.push(hole);
  return new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2.2),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
}

/**
 * Arcade docking: request clearance, fly the holographic gates into the bay, and the clamps
 * take over once you are inside the mouth and slow enough. Works on stations and on capital
 * ships (a dock can ride on a moving parent).
 */
export class Docking {
  readonly ports: DockSpec[] = [];
  /** Port ids the current mission allows; null = none. */
  allowed: Set<string> | null = null;
  active: DockSpec | null = null;
  stage: DockStage = 'idle';
  private readonly gates: THREE.Mesh[] = [];
  private readonly group = new THREE.Group();
  private landT = 0;
  private readonly landFrom = new THREE.Vector3();
  private readonly landFromQ = new THREE.Quaternion();
  private time = 0;
  onDocked: ((port: DockSpec) => void) | null = null;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.group.visible = false;
  }

  add(ports: DockSpec[]): void {
    this.ports.push(...ports);
  }

  setPorts(ports: DockSpec[]): void {
    this.ports.length = 0;
    this.ports.push(...ports);
    this.reset();
  }

  reset(): void {
    this.allowed = null;
    this.active = null;
    this.stage = 'idle';
    this.group.visible = false;
  }

  frame(port: DockSpec, out: Frame): Frame {
    out.pad.copy(port.pad);
    out.outward.copy(port.outward);
    out.up.copy(port.up);
    if (port.parent) {
      port.parent.updateWorldMatrix(true, false);
      out.pad.applyMatrix4(port.parent.matrixWorld);
      out.outward.transformDirection(port.parent.matrixWorld);
      out.up.transformDirection(port.parent.matrixWorld);
    }
    return out;
  }

  private readonly f: Frame = { pad: new THREE.Vector3(), outward: new THREE.Vector3(), up: new THREE.Vector3() };

  /** World positions of every open port's outer gate, for HUD markers before clearance. */
  openPorts(): { name: string; pos: THREE.Vector3 }[] {
    if (!this.allowed || this.active) return [];
    return this.ports
      .filter((p) => this.allowed?.has(p.id))
      .map((p) => {
        const f = this.frame(p, { pad: new THREE.Vector3(), outward: new THREE.Vector3(), up: new THREE.Vector3() });
        return { name: p.name, pos: f.pad.clone().addScaledVector(f.outward, p.mouth + 60) };
      });
  }

  /** Allowed ports within range, best first: the one you are facing, then the nearest. */
  choices(pos: THREE.Vector3, facing: THREE.Vector3, range = 6000): DockSpec[] {
    const scored: { p: DockSpec; score: number }[] = [];
    for (const p of this.ports) {
      if (!this.allowed?.has(p.id)) continue;
      const f = this.frame(p, this.f);
      const approach = f.pad.clone().addScaledVector(f.outward, p.mouth + 60);
      const d = approach.distanceTo(pos);
      if (d > range) continue;
      const angle = approach.sub(pos).normalize().angleTo(facing);
      scored.push({ p, score: angle + d / 20000 });
    }
    return scored.sort((a, b) => a.score - b.score).map((s) => s.p);
  }

  /** Nearest allowed port within range, or null. */
  nearest(pos: THREE.Vector3, range = 6000): DockSpec | null {
    let best: DockSpec | null = null;
    let bestD = range;
    for (const p of this.ports) {
      if (!this.allowed?.has(p.id)) continue;
      const d = this.frame(p, this.f).pad.distanceTo(pos);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Grants clearance for a port and shows its guide gates. */
  begin(port: DockSpec): void {
    this.active = port;
    this.stage = 'approach';
    for (const g of this.gates) this.group.remove(g);
    this.gates.length = 0;
    const [w, h] = port.opening;
    const colors = ['#5fe8ff', '#5fe8ff', '#ffd84d', '#4dfcd2'];
    // outer approach gate, two gates leading to the mouth, and a flat one on the pad
    const sizes: [number, number][] = [
      [w * 1.6, h * 1.6],
      [w * 1.2, h * 1.2],
      [w * 0.9, h * 0.9],
      [9, 9],
    ];
    sizes.forEach(([gw, gh], i) => {
      const g = ringMesh(gw, gh, colors[i]);
      this.gates.push(g);
      this.group.add(g);
    });
    this.group.visible = true;
  }

  cancel(): void {
    this.active = null;
    this.stage = 'idle';
    this.group.visible = false;
  }

  /** Distances along the approach of each gate, measured out from the pad. */
  private gateOffsets(port: DockSpec): number[] {
    return [port.mouth + 260, port.mouth + 110, port.mouth, 0];
  }

  /**
   * Advances docking. Returns guide data for the HUD while docking is in progress. During
   * 'landing' and 'docked' it flies the ship itself.
   */
  update(ship: Ship, dt: number): DockGuide | null {
    this.time += dt;
    const port = this.active;
    if (!port) return null;
    const f = this.frame(port, this.f);
    const offs = this.gateOffsets(port);

    // place gates; they pulse, and the next one is brightest
    const look = _q.setFromUnitVectors(Z, f.outward);
    const upRot = _v2.copy(f.up).applyQuaternion(_q.clone().invert());
    const roll = Math.atan2(-upRot.x, upRot.y);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(Z, roll);
    this.gates.forEach((g, i) => {
      g.position.copy(f.pad).addScaledVector(f.outward, offs[i]);
      if (i === 3) {
        g.quaternion.setFromUnitVectors(Z, f.up);
        g.position.addScaledVector(f.up, -3.5);
      } else g.quaternion.copy(look).multiply(qRoll);
    });

    // where is the ship along the approach?
    _v.subVectors(ship.pos, f.pad);
    const along = _v.dot(f.outward);
    const lateral = _v.clone().addScaledVector(f.outward, -along).length();
    const speed = ship.vel.length();

    const open = Math.max(port.opening[0], port.opening[1]);
    const gate0 = _v2.copy(f.pad).addScaledVector(f.outward, offs[0]);
    if (this.stage === 'approach' && ((along < port.mouth + 130 && along > 0 && lateral < open * 1.6) || ship.pos.distanceTo(gate0) < open * 1.8)) {
      this.stage = 'entry';
    }
    if (this.stage === 'entry' && along > port.mouth + 400) this.stage = 'approach';
    if (this.stage === 'entry' && along < port.mouth - 4 && lateral < Math.max(port.opening[0], port.opening[1]) && speed < port.maxSpeed * 1.25) {
      this.stage = 'landing';
      this.landT = 0;
      this.landFrom.copy(ship.pos);
      this.landFromQ.copy(ship.quat);
    }

    // off the axis close in (beside the hull rather than in front of the mouth): back out to the
    // line-up gate first, instead of flying at the mouth through the hull
    const offAxis = lateral > Math.min(port.opening[0], port.opening[1]) * 0.9 && along < port.mouth + 60;
    const next = this.stage === 'approach' ? 0 : this.stage === 'entry' ? (along > port.mouth + 110 || offAxis ? 1 : 2) : 3;
    this.gates.forEach((g, i) => {
      const mat = g.material as THREE.MeshBasicMaterial;
      const on = i === next;
      mat.opacity = on ? 0.6 + Math.sin(this.time * 6) * 0.3 : i > next ? 0.22 : 0.05;
    });

    if (this.stage === 'landing' || this.stage === 'docked') {
      // clamps: ease onto the pad, nose pointing into the bay, level with the deck
      this.landT = Math.min(1, this.landT + dt / 2.2);
      const k = this.landT * this.landT * (3 - 2 * this.landT);
      const target = _v.copy(f.pad).addScaledVector(f.up, ship.cls.radius * 0.35);
      ship.pos.lerpVectors(this.landFrom, target, k);
      _m.lookAt(f.pad, _v2.copy(f.pad).add(f.outward), f.up);
      const qTarget = new THREE.Quaternion().setFromRotationMatrix(_m);
      ship.quat.slerpQuaternions(this.landFromQ, qTarget, k);
      ship.vel.set(0, 0, 0);
      ship.angVel.set(0, 0, 0);
      ship.controls.throttle = 0;
      if (this.landT >= 1 && this.stage === 'landing') {
        this.stage = 'docked';
        this.onDocked?.(port);
      }
      // the landing hold also follows a moving dock
      if (this.stage === 'docked') this.landFrom.copy(ship.pos);
      return {
        marker: f.pad.clone(),
        label: this.stage === 'docked' ? 'DOCKED' : 'DOCKING CLAMPS ENGAGED',
        distance: 0,
        speedLimit: port.maxSpeed,
        tooFast: false,
        stage: this.stage,
      };
    }

    const marker = f.pad.clone().addScaledVector(f.outward, offs[next]);
    const label =
      this.stage === 'approach'
        ? `APPROACH ${port.name.toUpperCase()}`
        : next === 1
          ? 'LINE UP WITH THE GATES'
          : `ENTER THE BAY · BELOW ${port.maxSpeed} M/S`;
    return {
      marker,
      label,
      distance: ship.pos.distanceTo(marker),
      speedLimit: port.maxSpeed,
      tooFast: this.stage === 'entry' && speed > port.maxSpeed * 1.25 && along < port.mouth + 300,
      stage: this.stage,
    };
  }

  /** Throttle cap on final approach: the flight computer eases you down to the bay limit. */
  static approachThrottle(guide: DockGuide | null, ship: Ship): number | null {
    if (!guide || guide.stage !== 'entry') return null;
    return clamp((guide.speedLimit * 0.85) / ship.cls.maxSpeed, 0.1, 1);
  }
}

/**
 * Docking computer: flies the gates for you, with a simple look-ahead to climb over anything in
 * the way. Also used by the test autopilot.
 */
export class DockPilot {
  private readonly hit = makeRayHit();
  private readonly desired = new THREE.Vector3();

  constructor(private readonly world: CollisionWorld) {}

  fly(ship: Ship, guide: DockGuide, dt: number): void {
    const c = ship.controls;
    c.fire = false;
    c.missile = false;
    c.boost = false;
    c.slide = false;
    c.strafeX = 0;
    c.strafeY = 0;
    this.desired.subVectors(guide.marker, ship.pos).normalize();
    const speed = ship.vel.length();
    if (speed > 1) {
      _v.copy(ship.vel).divideScalar(speed);
      if (this.world.raycast(ship.pos, _v, Math.max(80, speed * 2.5), ship.collisionRadius * 1.5, this.hit)) {
        this.desired.addScaledVector(this.hit.normal, 1.5).normalize();
      }
    }
    steerTowards(ship, this.desired, 0.8);
    const target = guide.stage === 'approach' ? (guide.distance > 400 ? 0.85 : 0.6) : (guide.speedLimit * 0.7) / ship.cls.maxSpeed;
    c.throttle += (clamp(target, 0.1, 1) - c.throttle) * dampFactor(2, dt);
  }
}
