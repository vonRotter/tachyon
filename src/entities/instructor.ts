import * as THREE from 'three';
import { clamp } from '../core/math';
import type { Ship } from './ship';

const _inv = new THREE.Quaternion();
const _local = new THREE.Vector3();
const _upLocal = new THREE.Vector3();

/**
 * Mouse-aim flight computer, modelled on War Thunder's "Instructor": the player points the
 * camera, and this turns the requested direction into pitch, yaw and roll commands within the
 * ship's own limits. Small corrections use pitch and yaw directly for precise tracking; large
 * turns bank first and pull, like an aircraft. On target, it rolls to match the camera's up so
 * the view and the ship stay level with each other.
 *
 * Outputs are written to `ship.controls` (pitch, yaw, roll in -1..1).
 */
export function instruct(ship: Ship, desired: THREE.Vector3, aimUp: THREE.Vector3): void {
  const c = ship.controls;
  const cls = ship.cls;
  _inv.copy(ship.quat).invert();
  const local = _local.copy(desired).applyQuaternion(_inv);
  const pitchErr = Math.atan2(local.y, -local.z);
  const yawErr = Math.atan2(local.x, -local.z);
  const off = Math.atan2(Math.hypot(local.x, local.y), -local.z);

  // Proportional-derivative control: the rate terms stop the nose overshooting the reticle.
  const gain = 3.4;
  const damp = 0.5;
  c.pitch = clamp(pitchErr * gain - (ship.angVel.x / cls.pitchRate) * damp, -1, 1);
  c.yaw = clamp(yawErr * gain + (ship.angVel.y / cls.yawRate) * damp, -1, 1);

  // Roll: level with the camera when close to target, bank into the turn when far off.
  _upLocal.copy(aimUp).applyQuaternion(_inv);
  const rollLevel = Math.atan2(_upLocal.x, _upLocal.y);
  const rollBank = Math.atan2(local.x, Math.abs(local.y) + 1e-3);
  const bankWeight = THREE.MathUtils.smoothstep(off, 0.12, 0.45);
  const rollErr = rollLevel + (rollBank - rollLevel) * bankWeight;
  const rollRateNow = -ship.angVel.z / cls.rollRate;
  c.roll = clamp(rollErr * 2.4 - rollRateNow * 0.35, -1, 1);
}
