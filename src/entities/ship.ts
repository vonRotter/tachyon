import * as THREE from 'three';
import { clamp, dampFactor, rand } from '../core/math';
import { FACTIONS, type FactionId } from './factions';
import { createFlames, getShipModel, type ShipModel } from './models';
import type { ShipClass } from './shipClasses';
import type { Effects } from '../fx/effects';

export interface ShipControls {
  pitch: number;
  yaw: number;
  roll: number;
  /** Absolute throttle target 0..1. */
  throttle: number;
  strafeX: number;
  strafeY: number;
  boost: boolean;
  slide: boolean;
  fire: boolean;
  missile: boolean;
}

export const emptyControls = (): ShipControls => ({
  pitch: 0,
  yaw: 0,
  roll: 0,
  throttle: 0.7,
  strafeX: 0,
  strafeY: 0,
  boost: false,
  slide: false,
  fire: false,
  missile: false,
});

const shieldVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const shieldFragment = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float f = pow(1.0 - abs(dot(vN, vV)), 2.0);
    gl_FragColor = vec4(uColor * (f * 2.2 + 0.08) * uOpacity, 1.0);
  }
`;
const shieldGeometry = new THREE.SphereGeometry(1, 24, 16);

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _desired = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

let nextShipId = 1;

export class Ship {
  readonly id = nextShipId++;
  readonly root = new THREE.Group();
  readonly model: ShipModel;
  readonly flames: THREE.Mesh[];
  private readonly shieldMesh: THREE.Mesh;
  private readonly shieldMat: THREE.ShaderMaterial;
  private readonly engineColor: THREE.Color;

  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  /** Local angular velocity: x = pitch, y = yaw, z = roll (rad/s, right-handed). */
  readonly angVel = new THREE.Vector3();
  controls: ShipControls = emptyControls();

  hull: number;
  shields: number;
  energy: number;
  missiles: number;
  alive = true;
  isPlayer = false;
  invulnerable = false;
  /** Multiplier on incoming damage (story wingmen are a little tougher than they look). */
  damageScale = 1;
  target: Ship | null = null;
  ai: { update(ship: Ship, dt: number): void } | null = null;

  gunTimer = 0;
  gunSide = 0;
  missileTimer = 0;
  lastDamageTime = -99;
  lastAttacker: Ship | null = null;
  boosting = false;
  sliding = false;
  thrust = 0;
  private shieldFlash = 0;
  private trailTimer = 0;
  private smokeTimer = 0;
  /** Seconds since spawn. */
  age = 0;

  kills = 0;
  shotsFired = 0;
  shotsHit = 0;

  constructor(
    readonly cls: ShipClass,
    readonly faction: FactionId,
    readonly name: string,
  ) {
    const palette = FACTIONS[faction].palette;
    this.model = getShipModel(cls.model, palette, faction);
    this.root.add(this.model.group);
    this.engineColor = new THREE.Color(palette.engine).multiplyScalar(0.9);
    const box = new THREE.Box3().setFromObject(this.model.group);
    this.flames = createFlames(this.model, palette.engine);

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.shieldMat = new THREE.ShaderMaterial({
      vertexShader: shieldVertex,
      fragmentShader: shieldFragment,
      uniforms: {
        uColor: { value: new THREE.Color(palette.accent).lerp(new THREE.Color('#7fd8ff'), 0.5) },
        uOpacity: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.shieldMesh = new THREE.Mesh(shieldGeometry, this.shieldMat);
    this.shieldMesh.scale.set(size.x * 0.62, Math.max(size.y, size.x * 0.4) * 0.75, size.z * 0.62);
    this.shieldMesh.position.copy(center);
    this.shieldMesh.visible = false;
    this.root.add(this.shieldMesh);

    this.hull = cls.hull;
    this.shields = cls.shields;
    this.energy = cls.energy;
    this.missiles = cls.missiles;
  }

  get radius(): number {
    return this.cls.radius;
  }

  get speed(): number {
    return this.vel.length();
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0, -1).applyQuaternion(this.quat);
  }

  right(out: THREE.Vector3): THREE.Vector3 {
    return out.set(1, 0, 0).applyQuaternion(this.quat);
  }

  up(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 1, 0).applyQuaternion(this.quat);
  }

  /** Local point to world. */
  toWorld(local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(local).applyQuaternion(this.quat).add(this.pos);
  }

  placeAt(p: THREE.Vector3, lookAt: THREE.Vector3, speed: number): void {
    this.pos.copy(p);
    const m = new THREE.Matrix4().lookAt(p, lookAt, new THREE.Vector3(0, 1, 0));
    this.quat.setFromRotationMatrix(m);
    this.forward(this.vel).multiplyScalar(speed);
    this.controls.throttle = speed / this.cls.maxSpeed;
    this.syncTransform();
  }

  syncTransform(): void {
    this.root.position.copy(this.pos);
    this.root.quaternion.copy(this.quat);
  }

  /**
   * Arcade flight with Tachyon-style slide: normally velocity chases the nose, but while
   * sliding the ship keeps its momentum and can rotate freely to shoot behind itself.
   */
  updateFlight(dt: number): void {
    const c = this.controls;
    const cls = this.cls;
    this.age += dt;

    // rotation
    const k = dampFactor(cls.turnResponse, dt);
    const slideBonus = c.slide ? 1.25 : 1;
    this.angVel.x += (c.pitch * cls.pitchRate * slideBonus - this.angVel.x) * k;
    this.angVel.y += (-c.yaw * cls.yawRate * slideBonus - this.angVel.y) * k;
    this.angVel.z += (-c.roll * cls.rollRate - this.angVel.z) * k;
    const angle = this.angVel.length() * dt;
    if (angle > 1e-6) {
      _v.copy(this.angVel).normalize();
      _q.setFromAxisAngle(_v, angle);
      this.quat.multiply(_q).normalize();
    }

    this.forward(_fwd);
    this.right(_right);
    this.up(_up);

    // energy and boost
    const wantsBoost = c.boost && this.energy > 2;
    this.boosting = wantsBoost;
    if (wantsBoost) this.energy = Math.max(0, this.energy - cls.boostDrain * dt);
    else this.energy = Math.min(cls.energy, this.energy + cls.energyRegen * dt);
    this.sliding = c.slide;

    if (!c.slide) {
      const targetSpeed = wantsBoost ? cls.boostSpeed : clamp(c.throttle, 0, 1) * cls.maxSpeed;
      _desired
        .copy(_fwd)
        .multiplyScalar(targetSpeed)
        .addScaledVector(_right, c.strafeX * cls.strafeSpeed)
        .addScaledVector(_up, c.strafeY * cls.strafeSpeed);
      const accel = wantsBoost ? cls.accel * 1.6 : cls.accel;
      this.vel.lerp(_desired, dampFactor(accel, dt));
      this.thrust = wantsBoost ? 1 : clamp(c.throttle, 0.05, 1);
    } else {
      // momentum preserved; thrusters nudge, boost pushes along the nose
      this.vel.addScaledVector(_right, c.strafeX * cls.strafeSpeed * 1.2 * dt);
      this.vel.addScaledVector(_up, c.strafeY * cls.strafeSpeed * 1.2 * dt);
      if (wantsBoost) this.vel.addScaledVector(_fwd, cls.boostSpeed * 0.9 * dt);
      const sp = this.vel.length();
      if (sp > cls.boostSpeed) this.vel.multiplyScalar(cls.boostSpeed / sp);
      this.thrust = wantsBoost ? 1 : 0.1;
    }

    // shields
    if (this.age - this.lastDamageTime > cls.shieldDelay) {
      this.shields = Math.min(cls.shields, this.shields + cls.shieldRegen * dt);
    }
    if (this.gunTimer > 0) this.gunTimer -= dt;
    if (this.missileTimer > 0) this.missileTimer -= dt;
  }

  /** Applies damage; returns true if this hit destroyed the ship. */
  damage(amount: number, source: Ship | null): boolean {
    if (!this.alive || this.invulnerable) return false;
    amount *= this.damageScale;
    this.lastDamageTime = this.age;
    if (source) this.lastAttacker = source;
    if (this.shields > 0) {
      const absorbed = Math.min(this.shields, amount);
      this.shields -= absorbed;
      amount -= absorbed;
      this.shieldFlash = 1;
    }
    if (amount > 0) this.hull -= amount;
    if (this.hull <= 0) {
      this.hull = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  updateVisuals(dt: number, fx: Effects, time: number): void {
    this.syncTransform();
    // engine flames
    const flicker = 0.85 + Math.sin(time * 60 + this.id) * 0.08 + Math.random() * 0.07;
    // the chase camera sits right behind the player's nozzles, where long cones turn into beams
    const lenScale = (this.isPlayer ? 0.5 : 1) * (this.cls.radius > 8 ? 2.5 : 1);
    const len = (0.9 + this.thrust * 1.9 + (this.boosting ? 2.4 : 0)) * flicker * lenScale;
    const width = this.model.engineRadius * (this.boosting ? 1.2 : 1);
    for (const f of this.flames) f.scale.set(width, width, len);

    // trails
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = this.isPlayer ? 0.02 : 0.03;
      for (const e of this.model.engines) {
        this.toWorld(_v.copy(e), _v2);
        _v.copy(this.vel).multiplyScalar(0.2);
        fx.trail(
          _v2,
          _v,
          this.engineColor,
          this.model.engineRadius * (this.boosting ? 2.6 : 1.7) * (this.isPlayer ? 0.6 : 1),
          this.boosting ? 0.5 : 0.3,
        );
      }
    }

    // smoke when badly damaged
    if (this.hull < this.cls.hull * 0.4) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.05;
        _v.set(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)).multiplyScalar(this.radius * 0.5).add(this.pos);
        fx.smoke(_v, _v2.copy(this.vel).multiplyScalar(0.3));
      }
    }

    // shield shimmer
    if (this.shieldFlash > 0) {
      this.shieldFlash = Math.max(0, this.shieldFlash - dt * 3);
      this.shieldMesh.visible = true;
      this.shieldMat.uniforms.uOpacity.value = this.shieldFlash;
    } else this.shieldMesh.visible = false;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    this.shieldMat.dispose();
  }
}
