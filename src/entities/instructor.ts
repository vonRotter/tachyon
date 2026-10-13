import * as THREE from 'three';
import { clamp } from '../core/math';
import type { Ship } from './ship';

const _inv = new THREE.Quaternion();
const _local = new THREE.Vector3();
const _upLocal = new THREE.Vector3();
const _rateLocal = new THREE.Vector3();

/**
 * Commands one rotation axis towards an angular error without overshooting, while matching the
 * rate at which the reticle is moving (feed-forward), so a steadily tracked target is not trailed.
 *
 * The ship's rotation rate lags its stick input (it is modelled with inertia), so the controller
 * first predicts the error a lag-time ahead, then asks for the fastest rate that can still be
 * braked to zero by the target: rate = sqrt(2 * decel * error), capped at the axis maximum.
 * Returns a stick command in -1..1.
 */
function axisCommand(error: number, rate: number, maxRate: number, lag: number, feedForward: number): number {
  // The reticle itself is moving at `feedForward`; match that rate and close the gap on top.
  const predicted = error + (feedForward - rate) * lag;
  const decel = (maxRate / lag) * 0.85;
  const correction = Math.sign(predicted) * Math.min(maxRate, Math.sqrt(2 * decel * Math.abs(predicted)));
  return clamp((feedForward + correction) / maxRate, -1, 1);
}

/**
 * Mouse-aim flight computer, modelled on War Thunder's "Instructor": the player points the
 * camera, and this turns the requested direction into pitch, yaw and roll commands within the
 * ship's own limits. Small corrections use pitch and yaw directly for precise tracking; large
 * turns add a moderate bank into the turn. Near the target it eases back to level with the
 * camera, slowly enough that the roll does not drag the nose off the reticle.
 *
 * Near 180 degrees the turn direction is ill-defined, so it is held steady (hysteresis) instead
 * of flipping frame to frame when the aim is behind the ship.
 */
export class Instructor {
  /** Last committed turn direction in the nose plane (x = right, y = up). */
  private readonly dir = new THREE.Vector2(0, 1);

  /**
   * @param aimRate angular velocity of the aim direction in world space (rad/s), used to lead
   *   the turn instead of only reacting to error
   */
  fly(ship: Ship, desired: THREE.Vector3, aimUp: THREE.Vector3, aimRate: THREE.Vector3): void {
    const c = ship.controls;
    const cls = ship.cls;
    // rotation rates follow the stick with a first-order lag of this time constant (see Ship)
    const lag = 1 / (cls.turnResponse * 0.6);
    _inv.copy(ship.quat).invert();
    const local = _local.copy(desired).applyQuaternion(_inv);
    const angle = Math.acos(clamp(-local.z, -1, 1));
    const lateral = Math.hypot(local.x, local.y);
    if (lateral > 1e-4) {
      const nx = local.x / lateral;
      const ny = local.y / lateral;
      const behind = angle > 2.0;
      if (!behind || nx * this.dir.x + ny * this.dir.y > -0.2) this.dir.set(nx, ny);
    }

    // Pitch and yaw: angVel.x is nose-up rate, -angVel.y is nose-right rate.
    const ff = _rateLocal.copy(aimRate).applyQuaternion(_inv);
    c.pitch = axisCommand(this.dir.y * angle, ship.angVel.x, cls.pitchRate, lag, clamp(ff.x, -cls.pitchRate, cls.pitchRate));
    c.yaw = axisCommand(this.dir.x * angle, -ship.angVel.y, cls.yawRate, lag, clamp(-ff.y, -cls.yawRate, cls.yawRate));

    // Roll: bank up to ~50 degrees into big turns (putting more of the turn on the strong pitch
    // axis), otherwise settle level with the camera. -angVel.z is the roll-right rate.
    _upLocal.copy(aimUp).applyQuaternion(_inv);
    const rollLevel = Math.atan2(_upLocal.x, _upLocal.y);
    const bankWeight = THREE.MathUtils.smoothstep(angle, 0.2, 0.7);
    const bank = clamp(Math.atan2(this.dir.x, Math.abs(this.dir.y) + 0.35), -0.9, 0.9);
    // the bank is relative to the camera's level, so add it to the levelling error
    const rollErr = rollLevel + bank * bankWeight;
    const rollMax = cls.rollRate * (angle < 0.2 ? 0.45 : 1);
    c.roll = axisCommand(rollErr, -ship.angVel.z, rollMax, lag, 0) * (rollMax / cls.rollRate);
  }

  reset(): void {
    this.dir.set(0, 1);
  }
}
