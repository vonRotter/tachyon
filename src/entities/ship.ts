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

// Shield bubble: faint fresnel plus a hex lattice and a shockwave ring that spreads from the
// exact impact point.
const shieldVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vP = normalize(position);
    gl_Position = projectionMatrix * mv;
  }
`;
const shieldFragment = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec3 uImpact;
  uniform float uAge;
  float hexEdge(vec2 p) {
    p *= vec2(1.0, 1.1547);
    p.x += mod(floor(p.y), 2.0) * 0.5;
    vec2 f = abs(fract(p) - 0.5);
    return max(f.x * 1.5 + f.y, f.y * 2.0);
  }
  void main() {
    float fres = pow(1.0 - abs(dot(vN, vV)), 2.5);
    float d = acos(clamp(dot(vP, uImpact), -1.0, 1.0));
    float ring = exp(-pow((d - uAge * 3.2) * 7.0, 2.0)) * (1.0 - uAge);
    float spot = exp(-d * 5.0) * (1.0 - uAge);
    vec2 uv = vec2(atan(vP.z, vP.x) * 3.0, vP.y * 6.0);
    float hex = smoothstep(0.86, 0.98, hexEdge(uv));
    float body = fres * 0.6 + hex * (spot * 1.5 + ring * 0.8) + ring * 1.4 + spot * 1.2;
    gl_FragColor = vec4(uColor * body * uOpacity, 1.0);
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
        uImpact: { value: new THREE.Vector3(0, 0, -1) },
        uAge: { value: 1 },
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

  /** Radius used against station geometry (the core sphere for compound hulls). */
  get collisionRadius(): number {
    return this.cls.hitSpheres ? Math.max(...this.cls.hitSpheres.map((h) => h[3])) : this.cls.radius;
  }

  /** World-space hit spheres: one for fighters, a chain along the hull for long ships. */
  readonly spheres: { c: THREE.Vector3; r: number }[] = [];

  updateSpheres(): void {
    const hs = this.cls.hitSpheres;
    if (!hs) {
      if (!this.spheres.length) this.spheres.push({ c: new THREE.Vector3(), r: this.cls.radius });
      this.spheres[0].c.copy(this.pos);
      return;
    }
    if (!this.spheres.length) for (const h of hs) this.spheres.push({ c: new THREE.Vector3(), r: h[3] });
    for (let i = 0; i < hs.length; i++) this.toWorld(_v.set(hs[i][0], hs[i][1], hs[i][2]), this.spheres[i].c);
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
    this.updateSpheres();
  }

  /**
   * Arcade flight with Tachyon-style slide: normally velocity chases the nose, but while
   * sliding the ship keeps its momentum and can rotate freely to shoot behind itself.
   */
  updateFlight(dt: number): void {
    const c = this.controls;
    const cls = this.cls;
    this.age += dt;

    // rotation: rates build up and bleed off rather than snapping. Agility depends on speed, as
    // in a fighter: sharpest around cruise, sluggish when crawling, widest when boosting.
    const k = dampFactor(cls.turnResponse * 0.6, dt);
    const sf = this.vel.length() / cls.maxSpeed;
    const agility = sf < 0.35 ? 0.75 + (sf / 0.35) * 0.35 : sf <= 0.9 ? 1.1 : Math.max(0.68, 1.1 - (sf - 0.9) * 0.4);
    const slideBonus = c.slide ? 1.25 : 1;
    const turn = c.slide ? slideBonus : agility;
    this.angVel.x += (c.pitch * cls.pitchRate * turn - this.angVel.x) * k;
    this.angVel.y += (-c.yaw * cls.yawRate * turn - this.angVel.y) * k;
    this.angVel.z += (-c.roll * cls.rollRate * (0.85 + 0.15 * turn) - this.angVel.z) * k;
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
      // Forward speed is driven by a thrust-limited motor; sideways velocity is bled off by the
      // flight computer at a finite rate ("grip"), so hard turns carve with some slip.
      const targetSpeed = wantsBoost ? cls.boostSpeed : clamp(c.throttle, 0, 1) * cls.maxSpeed;
      const along = this.vel.dot(_fwd);
      const thrustAccel = wantsBoost ? cls.boostSpeed * 0.55 : cls.maxSpeed * 0.6;
      const brakeAccel = cls.maxSpeed * 0.75;
      const dv = clamp(targetSpeed - along, -brakeAccel * dt, thrustAccel * dt);
      this.vel.addScaledVector(_fwd, dv);
      // energy: pulling hard bleeds speed the thrusters then have to win back
      const pull = Math.abs(this.angVel.x) + Math.abs(this.angVel.y) * 0.6;
      if (along > 20) this.vel.addScaledVector(_fwd, -Math.min(along * 0.5, pull * along * 0.22) * dt);
      _desired.copy(this.vel).addScaledVector(_fwd, -this.vel.dot(_fwd));
      _v2.copy(_right).multiplyScalar(c.strafeX * cls.strafeSpeed).addScaledVector(_up, c.strafeY * cls.strafeSpeed);
      this.vel.addScaledVector(_v2.sub(_desired), dampFactor(cls.accel * 0.85, dt));
      this.thrust = wantsBoost ? 1 : clamp(0.15 + Math.max(0, dv / (thrustAccel * dt + 1e-6)) * 0.6 + c.throttle * 0.4, 0.05, 1);
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
    // The hull banks into yaw and leans with pitch like an aircraft. Purely visual: physics and
    // the camera use the unbanked orientation.
    const g = this.model.group;
    const bankTarget = clamp(this.angVel.y * 0.4, -0.55, 0.55);
    const leanTarget = clamp(-this.angVel.x * 0.06, -0.12, 0.12);
    g.rotation.z += (bankTarget - g.rotation.z) * dampFactor(5, dt);
    g.rotation.x += (leanTarget - g.rotation.x) * dampFactor(5, dt);
    // engine flames
    const flicker = 0.85 + Math.sin(time * 60 + this.id) * 0.08 + Math.random() * 0.07;
    // the chase camera sits right behind the player's nozzles, where long cones turn into beams
    const lenScale = (this.isPlayer ? 0.5 : 1) * (this.cls.radius > 8 ? 2.5 : 1);
    const len = (0.9 + this.thrust * 1.9 + (this.boosting ? 2.4 : 0)) * flicker * lenScale;
    const width = this.model.engineRadius * (this.boosting ? 1.2 : 1);
    const glow = 0.25 + this.thrust * 0.55 + (this.boosting ? 0.2 : 0);
    for (const f of this.flames) {
      f.scale.set(width, width, len);
      (f.material as THREE.MeshBasicMaterial).opacity = glow;
      ((f.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = glow;
    }

    // trails
    // trails are emitted per metre travelled, so a hovering ship does not pile sprites on one spot
    this.trailTimer -= dt * Math.min(1, this.speed / 40);
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
          this.isPlayer ? 0.55 : 1,
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

    // shield ripple
    if (this.shieldFlash > 0) {
      this.shieldFlash = Math.max(0, this.shieldFlash - dt * 1.8);
      this.shieldMesh.visible = true;
      this.shieldMat.uniforms.uOpacity.value = Math.min(1, this.shieldFlash * 1.5);
      this.shieldMat.uniforms.uAge.value = 1 - this.shieldFlash;
    } else this.shieldMesh.visible = false;
  }

  /** Points the shield ripple at a world-space impact position. */
  shieldImpact(worldPoint: THREE.Vector3): void {
    this.root.updateMatrixWorld();
    const local = this.shieldMesh.worldToLocal(worldPoint.clone());
    (this.shieldMat.uniforms.uImpact.value as THREE.Vector3).copy(local).normalize();
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    this.shieldMat.dispose();
  }
}
