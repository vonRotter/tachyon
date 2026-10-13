import * as THREE from 'three';
import { clamp } from '../core/math';
import { CollisionWorld } from '../world/colliders';
import { buildCapitalHull, CAPITAL_INFO, STYLES, type CapitalKind } from '../world/capitals';
import type { DockSpec, TurretMount } from '../world/structures';
import type { FactionId } from './factions';
import type { Ship } from './ship';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

/**
 * A capital ship that moves: its hull is built in its own frame into a private collision
 * sub-world attached to the game world, so fighters can fly through its hangars and bounce off
 * its hull while it steams along. Turrets are ordinary (anchored) ships that ride its mounts;
 * its docks ride it too.
 */
export class CapitalShip {
  readonly root = new THREE.Group();
  readonly world = new CollisionWorld();
  readonly kind: CapitalKind;
  readonly id: string;
  readonly name: string;
  readonly faction: FactionId;
  readonly docks: DockSpec[];
  readonly bays: { pos: THREE.Vector3; out: THREE.Vector3 }[];
  readonly mounts: TurretMount[];
  readonly turrets: { ship: Ship; local: THREE.Vector3 }[] = [];
  /** Cruise speed (m/s) along its nose. */
  speed = 0;
  /** Yaw rate limit while turning towards `heading`. */
  turnRate = 0.04;
  /** Point to steam towards, if any. */
  goal: THREE.Vector3 | null = null;

  constructor(kind: CapitalKind, faction: FactionId, id: string, name: string, pos: THREE.Vector3, look: THREE.Vector3) {
    this.kind = kind;
    this.id = id;
    this.name = name;
    this.faction = faction;
    const style = { ...(STYLES[faction] ?? STYLES.combine), id, name };
    const hull = buildCapitalHull(kind, this.world, new THREE.Matrix4(), style);
    this.root.add(hull.group);
    this.docks = (hull.docks ?? []).map((d) => ({ ...d, parent: this.root }));
    this.bays = hull.bays ?? [];
    this.mounts = hull.turrets ?? [];
    this.root.position.copy(pos);
    this.root.lookAt(look);
    // Object3D.lookAt points +Z at the target; capital ships fly -Z
    this.root.rotateY(Math.PI);
    this.root.updateMatrixWorld(true);
  }

  get info() {
    return CAPITAL_INFO[this.kind];
  }

  /** Local point to world. */
  toWorld(local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(local).applyMatrix4(this.root.matrixWorld);
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(0, 0, -1).applyQuaternion(this.root.quaternion);
  }

  update(dt: number): void {
    if (this.goal) {
      // turn the nose (yaw only) towards the goal at a stately rate
      _v.subVectors(this.goal, this.root.position).setY(0);
      if (_v.lengthSq() > 1) {
        const want = Math.atan2(-_v.x, -_v.z);
        const fwd = this.forward(new THREE.Vector3());
        const have = Math.atan2(-fwd.x, -fwd.z);
        let d = want - have;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.root.quaternion.premultiply(_q.setFromAxisAngle(Y, clamp(d, -this.turnRate * dt, this.turnRate * dt)));
      }
    }
    if (this.speed) this.root.position.addScaledVector(this.forward(_v), this.speed * dt);
    this.root.updateMatrixWorld(true);
    for (const t of this.turrets) {
      if (!t.ship.alive) continue;
      this.toWorld(t.local, t.ship.pos);
    }
  }
}
