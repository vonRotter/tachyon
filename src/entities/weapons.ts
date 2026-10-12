import * as THREE from 'three';
import { interceptTime, raySphere, rand } from '../core/math';
import { makeRayHit, type CollisionWorld } from '../world/colliders';
import { hostile, type FactionId } from './factions';
import type { Ship } from './ship';
import type { Effects } from '../fx/effects';
import type { AudioEngine } from '../core/audio';

export interface CombatContext {
  world: CollisionWorld;
  ships: Ship[];
  fx: Effects;
  audio: AudioEngine;
  onShipHit(ship: Ship, damage: number, source: Ship | null, point: THREE.Vector3, kind: 'bolt' | 'missile'): void;
}

const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const Z = new THREE.Vector3(0, 0, 1);
const WHITE3 = new THREE.Color(3, 3, 3);
const hit = makeRayHit();

/** Instanced laser bolts. Hit tests sweep each bolt's per-step segment. */
export class BoltSystem {
  readonly mesh: THREE.InstancedMesh;
  /** Wider additive halo drawn around each bolt's hot core. */
  private readonly halo: THREE.InstancedMesh;
  private readonly haloColor = new THREE.Color();
  private readonly max = 1200;
  private n = 0;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly dmg: Float32Array;
  private readonly owner: (Ship | null)[] = [];
  private readonly faction: FactionId[] = [];
  private readonly color: THREE.Color[] = [];

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.dmg = new Float32Array(this.max);
    const geo = new THREE.BoxGeometry(0.32, 0.32, 1);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.halo = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.1, 1.1, 1),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      this.max,
    );
    this.halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.halo.count = 0;
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 3;
    for (let i = 0; i < this.max; i++) {
      this.color.push(new THREE.Color());
      this.owner.push(null);
      this.faction.push('player');
      this.mesh.setColorAt(i, _c.set('#ffffff'));
      this.halo.setColorAt(i, _c.set('#ffffff'));
    }
    scene.add(this.mesh);
    scene.add(this.halo);
  }

  spawn(p: THREE.Vector3, v: THREE.Vector3, damage: number, owner: Ship, color: string, range: number): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.life[i] = range / v.length();
    this.dmg[i] = damage;
    this.owner[i] = owner;
    this.faction[i] = owner.faction;
    this.color[i].set(color).multiplyScalar(3.2);
  }

  private remove(i: number): void {
    const last = --this.n;
    if (i === last) return;
    for (let k = 0; k < 3; k++) {
      this.pos[i * 3 + k] = this.pos[last * 3 + k];
      this.vel[i * 3 + k] = this.vel[last * 3 + k];
    }
    this.life[i] = this.life[last];
    this.dmg[i] = this.dmg[last];
    this.owner[i] = this.owner[last];
    this.faction[i] = this.faction[last];
    this.color[i].copy(this.color[last]);
  }

  /** Camera position; bolts brushing the lens are hidden instead of filling the screen. */
  readonly eye = new THREE.Vector3();

  update(dt: number, ctx: CombatContext): void {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.remove(i);
        continue;
      }
      _p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      _d.set(this.vel[i * 3], this.vel[i * 3 + 1], this.vel[i * 3 + 2]);
      const speed = _d.length();
      const step = speed * dt;
      _d.divideScalar(speed);

      // ships first (nearest along the segment)
      let bestT = step;
      let bestShip: Ship | null = null;
      for (const s of ctx.ships) {
        if (!s.alive || s === this.owner[i] || !hostile(this.faction[i], s.faction)) continue;
        const pad = s.spheres.length > 1 ? 1 : 1.15;
        for (const sph of s.spheres) {
          const t = raySphere(_p, _d, sph.c, sph.r * pad, bestT);
          if (t >= 0 && t <= bestT) {
            bestT = t;
            bestShip = s;
          }
        }
      }
      const worldHit = ctx.world.raycast(_p, _d, bestT, 0, hit);
      if (worldHit) {
        ctx.fx.impact(hit.point, hit.normal, _c.copy(this.color[i]).multiplyScalar(1 / 3.2));
        this.remove(i);
        continue;
      }
      if (bestShip) {
        _p.addScaledVector(_d, bestT);
        ctx.onShipHit(bestShip, this.dmg[i], this.owner[i], _p, 'bolt');
        const owner = this.owner[i];
        if (owner) owner.shotsHit++;
        this.remove(i);
        continue;
      }
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      i++;
    }

    for (let j = 0; j < this.n; j++) {
      _p.set(this.pos[j * 3], this.pos[j * 3 + 1], this.pos[j * 3 + 2]);
      _d.set(this.vel[j * 3], this.vel[j * 3 + 1], this.vel[j * 3 + 2]).normalize();
      _q.setFromUnitVectors(Z, _d);
      const near = _p.distanceToSquared(this.eye) < 100;
      _s.set(near ? 0 : 0.7, near ? 0 : 0.7, 11);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(j, _m);
      // core runs hot towards white; the halo carries the faction colour
      this.mesh.setColorAt(j, _c.copy(this.color[j]).lerp(WHITE3, 0.35));
      _s.set(near ? 0 : 1, near ? 0 : 1, 13);
      _m.compose(_p, _q, _s);
      this.halo.setMatrixAt(j, _m);
      this.halo.setColorAt(j, this.haloColor.copy(this.color[j]).multiplyScalar(0.5));
    }
    this.mesh.count = this.n;
    this.halo.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.halo.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.halo.instanceColor) this.halo.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
    this.halo.count = 0;
  }
}

const missileBody = new THREE.CylinderGeometry(0.28, 0.35, 2.6, 8).rotateX(Math.PI / 2);
const missileMat = new THREE.MeshStandardMaterial({ color: '#eeeeee', roughness: 0.4, metalness: 0.3 });
const missileGlowGeo = new THREE.SphereGeometry(0.55, 8, 6);

export class Missile {
  readonly mesh = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  /** Where the missile's nose (and seeker) points; thrust acts along it. */
  readonly dir = new THREE.Vector3(0, 0, -1);
  life = 9;
  age = 0;
  alive = true;
  trailTimer = 0;
  readonly speed: number;
  readonly turnRate: number;

  constructor(
    readonly owner: Ship,
    public target: Ship | null,
    glowColor: string,
  ) {
    this.mesh.add(new THREE.Mesh(missileBody, missileMat));
    const glow = new THREE.Mesh(
      missileGlowGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(glowColor).multiplyScalar(3), toneMapped: false }),
    );
    glow.position.z = 1.5;
    this.mesh.add(glow);
    this.speed = owner.isPlayer ? 200 : 165;
    this.turnRate = owner.isPlayer ? 2.3 : 1.75;
  }
}

/** Homing missiles. They fly the same geometry as everyone else, so struts kill them. */
export class MissileSystem {
  readonly missiles: Missile[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  launch(owner: Ship, target: Ship, ctx: CombatContext): Missile {
    const color = owner.isPlayer ? '#ffb347' : owner.faction === 'wake' ? '#ff3060' : '#55e6ff';
    const m = new Missile(owner, target, color);
    owner.forward(_d);
    m.pos.copy(owner.pos).addScaledVector(_d, owner.radius + 2).addScaledVector(owner.up(_p), -1.2);
    // The missile inherits the launcher's momentum but points where the launcher points. When
    // fired backwards out of a slide, its motor first has to cancel that momentum.
    m.dir.copy(_d);
    m.vel.copy(owner.vel).addScaledVector(_d, 25);
    m.mesh.position.copy(m.pos);
    this.scene.add(m.mesh);
    this.missiles.push(m);
    ctx.audio.missileLaunch(owner.isPlayer ? null : m.pos);
    return m;
  }

  /** Missiles currently homing on `ship`. */
  incoming(ship: Ship): Missile[] {
    return this.missiles.filter((m) => m.alive && m.target === ship);
  }

  update(dt: number, ctx: CombatContext): void {
    for (const m of this.missiles) {
      if (!m.alive) continue;
      m.life -= dt;
      m.age += dt;
      const t = m.target;
      if (t && t.alive) {
        _p.subVectors(t.pos, m.pos);
        const ti = interceptTime(_p, t.vel, Math.max(m.vel.length(), 120));
        const aim = _s.copy(t.pos).addScaledVector(t.vel, ti > 0 ? Math.min(ti, 3) : 0).sub(m.pos).normalize();
        const angle = m.dir.angleTo(aim);
        // the seeker looks along the nose, not along the direction of travel
        if (angle > 1.6 && m.age > 0.5) {
          m.target = null; // target left the seeker's field of view
        } else if (angle > 1e-4) {
          const k = Math.min(1, ((m.turnRate * (m.age < 0.5 ? 1.6 : 1)) * dt) / angle);
          m.dir.lerp(aim, k).normalize();
        }
      } else m.target = null;
      // rocket motor along the nose, with fins bleeding off sideways and backwards drift
      m.vel.addScaledVector(m.dir, 420 * dt);
      const along = m.vel.dot(m.dir);
      _p.copy(m.vel).addScaledVector(m.dir, -along);
      m.vel.addScaledVector(_p, -(1 - Math.exp(-3.5 * dt)));
      if (along < 0) m.vel.addScaledVector(m.dir, -along * (1 - Math.exp(-5 * dt)));
      const sp = m.vel.length();
      if (sp > m.speed) m.vel.multiplyScalar(m.speed / sp);
      const step = Math.min(sp, m.speed) * dt;
      _d.copy(m.vel).normalize();

      let detonate = false;
      let victim: Ship | null = null;
      if (ctx.world.raycast(m.pos, _d, step, 0.5, hit)) {
        m.pos.copy(hit.point);
        detonate = true;
      } else {
        m.pos.addScaledVector(m.vel, dt);
        for (const s of ctx.ships) {
          if (!s.alive || !hostile(m.owner.faction, s.faction)) continue;
          const fuse = s.radius + (s === m.target ? 4 : 2);
          if (s.pos.distanceToSquared(m.pos) < fuse * fuse) {
            victim = s;
            detonate = true;
            break;
          }
        }
      }
      if (m.life <= 0) detonate = true;

      if (detonate) {
        m.alive = false;
        ctx.fx.explosion(m.pos, 0.5, null, '#ffb040');
        ctx.audio.explosion(m.pos, 0.6);
        if (victim) ctx.onShipHit(victim, 75, m.owner, m.pos, 'missile');
        continue;
      }

      m.mesh.position.copy(m.pos);
      m.mesh.quaternion.setFromUnitVectors(Z, _p.copy(m.dir).negate());
      m.trailTimer -= dt;
      if (m.trailTimer <= 0) {
        m.trailTimer = 0.016;
        _p.copy(m.pos).addScaledVector(m.dir, -1.6);
        ctx.fx.particles.emit(_p, _s.set(rand(-3, 3), rand(-3, 3), rand(-3, 3)), {
          life: rand(0.8, 1.4),
          size0: 1.6,
          size1: 6,
          color0: _c.set('#ffd9a0').multiplyScalar(1.2),
          color1: new THREE.Color('#2a2040'),
          drag: 1,
          alpha: 0.6,
        });
      }
    }
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      if (!m.alive) {
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const m of this.missiles) this.scene.remove(m.mesh);
    this.missiles.length = 0;
  }
}
