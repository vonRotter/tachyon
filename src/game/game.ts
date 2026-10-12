import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AudioEngine, type LaserKind } from '../core/audio';
import { Input } from '../core/input';
import { clamp, dampFactor, interceptTime, rand } from '../core/math';
import { CollisionWorld, makeRayHit } from '../world/colliders';
import { Sky, SpaceDust, createLights } from '../world/environment';
import { buildAsteroids, buildCarrier, buildKestrelStation, type Beacon } from '../world/structures';
import { Effects } from '../fx/effects';
import { Ship } from '../entities/ship';
import { SHIP_CLASSES } from '../entities/shipClasses';
import { FACTIONS, hostile, type FactionId } from '../entities/factions';
import { AIPilot } from '../entities/ai';
import { BoltSystem, MissileSystem, type CombatContext } from '../entities/weapons';
import { Hud } from '../ui/hud';
import { Comms } from '../ui/comms';

export type GameState = 'title' | 'playing' | 'paused' | 'debrief';

export class MissionAbort extends Error {
  constructor() {
    super('mission aborted');
  }
}

interface Waiter {
  until: () => boolean;
  resolve: () => void;
  reject: (e: Error) => void;
}

export interface SpawnOptions {
  skill?: number;
  playerBias?: number;
  invulnerable?: boolean;
  speed?: number;
  damageScale?: number;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _relVel = new THREE.Vector3();
const _q = new THREE.Quaternion();
const hit = makeRayHit();

const ARENA_WARN = 3200;
const ARENA_LIMIT = 4000;

export class Game implements CombatContext {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.5, 20000);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly sky = new Sky();
  private readonly dust = new SpaceDust();
  readonly world = new CollisionWorld();
  readonly fx: Effects;
  readonly audio = new AudioEngine();
  readonly input: Input;
  readonly hud: Hud;
  readonly comms = new Comms();
  readonly bolts: BoltSystem;
  readonly missiles: MissileSystem;
  readonly points: Record<string, THREE.Vector3> = {};
  private readonly beacons: Beacon[] = [];
  private readonly beaconMesh: THREE.InstancedMesh;

  ships: Ship[] = [];
  player: Ship | null = null;
  state: GameState = 'title';
  time = 0;
  missionTime = 0;
  checkpoint = 0;
  objective = '';
  private hintText: string | null = null;
  private hintTimer = 0;
  private waiters: Waiter[] = [];
  private missionToken = 0;
  private readonly camQuat = new THREE.Quaternion();
  private cockpit = false;
  private shake = 0;
  private damageFlash = 0;
  private lockProgress = 0;
  private readonly lead = new THREE.Vector3();
  private hasLead = false;
  private readonly whooshCooldown = new Map<number, number>();
  private titleAngle = 0;
  private musicIntensity = 0.2;
  private boundaryTimer = 0;
  private readonly killListeners: ((ship: Ship, by: Ship | null) => void)[] = [];
  private fpsAccum = 0;
  private fpsFrames = 0;
  fps = 0;
  /** Set by the mission runner. */
  onMissionEnd: ((result: 'victory' | 'defeat') => void) | null = null;
  missionRunner: ((game: Game, checkpoint: number) => Promise<void>) | null = null;

  constructor(
    private readonly container: HTMLElement,
    hudCanvas: HTMLCanvasElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(hudCanvas);
    this.fx = new Effects(this.scene);
    this.bolts = new BoltSystem(this.scene);
    this.missiles = new MissileSystem(this.scene);

    this.composer = new EffectComposer(this.renderer);
    const skyPass = new RenderPass(this.sky.scene, this.sky.camera);
    const mainPass = new RenderPass(this.scene, this.camera);
    mainPass.clear = false;
    mainPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.92);
    this.composer.addPass(skyPass);
    this.composer.addPass(mainPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    createLights(this.scene);
    this.scene.add(this.dust.mesh);

    // world
    const station = buildKestrelStation(this.world);
    this.scene.add(station.group);
    const carrierTransform = new THREE.Matrix4().compose(
      new THREE.Vector3(1250, 140, -650),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0.9, 0.02)),
      new THREE.Vector3(1, 1, 1),
    );
    const carrier = buildCarrier(this.world, carrierTransform);
    this.scene.add(carrier.group);
    const rocks = buildAsteroids(this.world, new THREE.Vector3(-1200, -120, 650), 420, 46);
    this.scene.add(rocks.group);
    this.beacons.push(...station.beacons, ...carrier.beacons);
    for (const [k, v] of Object.entries(station.points)) this.points[`station.${k}`] = v;
    for (const [k, v] of Object.entries(carrier.points)) this.points[`carrier.${k}`] = v;
    this.points['rocks.center'] = rocks.points.center;

    this.beaconMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1.6, 1),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      this.beacons.length,
    );
    const m = new THREE.Matrix4();
    this.beacons.forEach((b, i) => {
      this.beaconMesh.setMatrixAt(i, m.makeTranslation(b.position.x, b.position.y, b.position.z));
      this.beaconMesh.setColorAt(i, b.color);
    });
    this.scene.add(this.beaconMesh);

    this.comms.onChirp = () => this.audio.commsChirp();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.hud.resize();
    this.fx.particles.setViewport(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  // ---------------------------------------------------------------------------------------------
  // Mission scripting API

  private checkToken(token: number): void {
    if (token !== this.missionToken) throw new MissionAbort();
  }

  until(pred: () => boolean): Promise<void> {
    const token = this.missionToken;
    return new Promise((resolve, reject) => {
      this.waiters.push({
        until: pred,
        resolve: () => {
          if (token !== this.missionToken) reject(new MissionAbort());
          else resolve();
        },
        reject,
      });
    });
  }

  wait(seconds: number): Promise<void> {
    const end = this.missionTime + seconds;
    return this.until(() => this.missionTime >= end);
  }

  async say(speaker: string, text: string): Promise<void> {
    const token = this.missionToken;
    await this.comms.say(speaker, text);
    this.checkToken(token);
  }

  hint(text: string, seconds = 5): void {
    this.hintText = text;
    this.hintTimer = seconds;
  }

  onKill(cb: (ship: Ship, by: Ship | null) => void): void {
    this.killListeners.push(cb);
  }

  spawnShip(
    classId: string,
    faction: FactionId,
    name: string,
    pos: THREE.Vector3,
    lookAt: THREE.Vector3,
    opts: SpawnOptions = {},
  ): Ship {
    const ship = new Ship(SHIP_CLASSES[classId], faction, name);
    ship.placeAt(pos, lookAt, opts.speed ?? ship.cls.maxSpeed * 0.8);
    if (opts.skill !== undefined) {
      const ai = new AIPilot(this, opts.skill);
      ai.playerBias = opts.playerBias ?? 0.5;
      ai.patrolPoint.copy(this.points['station.hub'] ?? new THREE.Vector3());
      ship.ai = ai;
    }
    ship.invulnerable = opts.invulnerable ?? false;
    ship.damageScale = opts.damageScale ?? 1;
    this.scene.add(ship.root);
    this.ships.push(ship);
    return ship;
  }

  /** Spawns a ship with a jump-in flash. */
  jumpIn(classId: string, faction: FactionId, name: string, pos: THREE.Vector3, lookAt: THREE.Vector3, opts: SpawnOptions = {}): Ship {
    const s = this.spawnShip(classId, faction, name, pos, lookAt, { speed: SHIP_CLASSES[classId].boostSpeed, ...opts });
    this.fx.jumpIn(pos, s.forward(_v), FACTIONS[faction].palette.engine);
    this.audio.jumpIn(pos);
    return s;
  }

  /** Removes a ship with a jump flash (retreat), without counting it as a kill. */
  jumpOut(ship: Ship): void {
    if (!ship.alive) return;
    ship.alive = false;
    this.fx.jumpIn(ship.pos, ship.forward(_v).negate(), FACTIONS[ship.faction].palette.engine);
    this.audio.jumpIn(ship.pos);
    ship.dispose(this.scene);
  }

  aliveCount(faction: FactionId): number {
    return this.ships.filter((s) => s.alive && s.faction === faction).length;
  }

  setMusicIntensity(v: number): void {
    this.musicIntensity = v;
  }

  // ---------------------------------------------------------------------------------------------
  // Session control

  /** Starts (or restarts) the mission from a checkpoint. */
  startMission(checkpoint: number): void {
    this.missionToken++;
    for (const w of this.waiters) w.reject(new MissionAbort());
    this.waiters = [];
    this.comms.clear();
    for (const s of this.ships) s.dispose(this.scene);
    this.ships = [];
    this.killListeners.length = 0;
    this.bolts.clear();
    this.missiles.clear();
    this.missionTime = 0;
    this.checkpoint = checkpoint;
    this.objective = '';
    this.hintText = null;
    this.lockProgress = 0;
    this.damageFlash = 0;

    const player = this.spawnShip(
      'kite',
      'player',
      'Rook',
      new THREE.Vector3(140, 60, 560),
      new THREE.Vector3(0, 40, 0),
      { speed: 40 },
    );
    player.isPlayer = true;
    player.controls.throttle = 0.4;
    this.player = player;
    this.camQuat.copy(player.quat);
    this.input.centerCursor();
    this.state = 'playing';

    const token = this.missionToken;
    const runner = this.missionRunner;
    if (runner) {
      runner(this, checkpoint).catch((e: unknown) => {
        if (!(e instanceof MissionAbort) && token === this.missionToken) console.error(e);
      });
    }
  }

  endMission(result: 'victory' | 'defeat'): void {
    if (this.state === 'debrief') return;
    this.state = 'debrief';
    this.audio.silenceLoops();
    this.audio.setLock('none');
    this.audio.setMissileWarning(0);
    this.input.exitPointerLock();
    this.onMissionEnd?.(result);
  }

  // ---------------------------------------------------------------------------------------------
  // Combat context

  onShipHit(ship: Ship, damage: number, source: Ship | null, point: THREE.Vector3, kind: 'bolt' | 'missile'): void {
    const hadShields = ship.shields > 0;
    const killed = ship.damage(damage, source);
    _n.subVectors(point, ship.pos).normalize();
    this.fx.impact(point, _n, hadShields ? '#7fd8ff' : '#ffb347');
    if (ship.isPlayer) {
      if (hadShields) this.audio.shieldHit();
      else this.audio.hullHit();
      this.damageFlash = Math.min(1, this.damageFlash + (hadShields ? 0.25 : 0.6));
      this.shake += kind === 'missile' ? 1.2 : 0.25;
    } else if (source?.isPlayer) {
      this.audio.blip(hadShields ? 2200 : 1600, 0.05, 0.03);
    }
    if (killed) this.destroyShip(ship, source);
  }

  private destroyShip(ship: Ship, by: Ship | null): void {
    ship.alive = false;
    const big = ship.radius > 8;
    this.fx.explosion(ship.pos, big ? 3 : 1.2, ship.vel, FACTIONS[ship.faction].palette.engine);
    if (big) {
      for (let i = 0; i < 5; i++) {
        const p = _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(ship.radius).add(ship.pos).clone();
        window.setTimeout(() => {
          this.fx.explosion(p, 1.2, null);
          this.audio.explosion(p, 1);
        }, 150 + i * 160);
      }
    }
    this.audio.explosion(ship.pos, big ? 2 : 1);
    if (this.player && ship.pos.distanceTo(this.player.pos) < 120) this.shake += big ? 2 : 0.8;
    ship.dispose(this.scene);
    if (by) by.kills++;
    for (const cb of this.killListeners) cb(ship, by);
    if (ship.isPlayer) {
      this.objective = '';
      window.setTimeout(() => this.endMission('defeat'), 2200);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Simulation

  private applyPlayerInput(dt: number): void {
    const p = this.player;
    if (!p || !p.alive) return;
    const f = this.input.read();
    const c = p.controls;
    c.pitch = f.pitch;
    c.yaw = f.yaw;
    c.roll = f.roll;
    c.strafeX = f.strafeX;
    c.strafeY = f.strafeY;
    c.boost = f.boost;
    c.slide = f.slide;
    c.fire = f.fire;
    c.missile = f.missile;
    c.throttle = clamp(c.throttle + f.throttleDelta * dt * 0.8, 0, 1);
    if (this.input.pressed('matchSpeed') && p.target) {
      c.throttle = clamp(p.target.speed / p.cls.maxSpeed, 0, 1);
    }
    if (this.input.pressed('targetNearest')) this.cycleTarget(true);
    if (this.input.pressed('targetNext')) this.cycleTarget(false);
    if (this.input.pressed('camera')) this.cockpit = !this.cockpit;
    if (this.input.pressed('centerMouse')) this.input.centerCursor();
  }

  private cycleTarget(nearest: boolean): void {
    const p = this.player;
    if (!p) return;
    const enemies = this.ships.filter((s) => s.alive && s !== p && hostile(p.faction, s.faction));
    if (!enemies.length) {
      p.target = null;
      return;
    }
    if (nearest) {
      p.forward(_v);
      // prefer what is in front of the nose, then distance
      enemies.sort((a, b) => {
        const sa = a.pos.distanceTo(p.pos) * (1.6 - _v.dot(_v2.subVectors(a.pos, p.pos).normalize()));
        const sb = b.pos.distanceTo(p.pos) * (1.6 - _v.dot(_v2.subVectors(b.pos, p.pos).normalize()));
        return sa - sb;
      });
      p.target = enemies[0];
    } else {
      const i = p.target ? enemies.indexOf(p.target) : -1;
      p.target = enemies[(i + 1) % enemies.length];
    }
    this.lockProgress = 0;
    this.audio.blip(1100, 0.08, 0.05);
  }

  private fireGuns(ship: Ship): void {
    const gun = ship.cls.gun;
    if (ship.gunTimer > 0 || ship.energy < gun.energyCost) return;
    ship.forward(_v);
    const gunLocal = ship.model.guns[ship.gunSide++ % ship.model.guns.length];
    const origin = ship.toWorld(gunLocal, _v2).clone();
    const dir = _v3;
    const t = ship.target;
    if (gun.turretArc !== undefined) {
      if (!t || !t.alive) return;
      _n.subVectors(t.pos, origin);
      const ti = interceptTime(_n, _relVel.subVectors(t.vel, ship.vel), gun.boltSpeed);
      dir.copy(t.pos).addScaledVector(t.vel, Math.max(ti, 0)).sub(origin).normalize();
      if (dir.angleTo(_v) > gun.turretArc) return;
    } else {
      dir.copy(ship.pos).addScaledVector(_v, 450).sub(origin).normalize();
      if (ship.isPlayer && t && t.alive && this.hasLead) {
        _n.subVectors(this.lead, origin).normalize();
        const assist = this.input.device === 'gamepad' ? 0.07 : 0.035;
        if (_n.angleTo(_v) < assist) dir.copy(_n);
      }
    }
    if (ship.ai) {
      const spread = 0.012 + (1 - (ship.ai as AIPilot).skill) * 0.02;
      dir.x += rand(-spread, spread);
      dir.y += rand(-spread, spread);
      dir.z += rand(-spread, spread);
      dir.normalize();
    }
    ship.gunTimer = gun.cooldown;
    ship.energy -= gun.energyCost;
    ship.shotsFired++;
    const vel = _n.copy(dir).multiplyScalar(gun.boltSpeed).add(ship.vel);
    const palette = FACTIONS[ship.faction].palette;
    this.bolts.spawn(origin, vel, gun.damage, ship, palette.bolt, gun.range);
    this.fx.particles.emit(origin, ship.vel, {
      life: 0.06,
      size0: 4,
      size1: 2,
      color0: new THREE.Color(palette.bolt).multiplyScalar(3),
      color1: new THREE.Color(palette.bolt),
    });
    const kind: LaserKind = ship.isPlayer
      ? 'player'
      : gun.turretArc !== undefined
        ? 'heavy'
        : ship.faction === 'wake'
          ? 'enemy'
          : 'ally';
    this.audio.laser(ship.isPlayer ? null : origin, kind);
  }

  private fireMissile(ship: Ship): void {
    if (ship.missiles <= 0) return;
    const target = ship.target;
    if (!target || !target.alive) return;
    if (ship.isPlayer) {
      if (this.lockProgress < 1 || ship.missileTimer > 0) {
        if (ship.missileTimer <= 0) this.audio.blip(300, 0.1, 0.1);
        return;
      }
      ship.missileTimer = 0.7;
    }
    ship.missiles--;
    this.missiles.launch(ship, target, this);
    if (target.isPlayer && this.checkpoint >= 0) this.hint('Missile inbound! Break hard or weave through structures to shake it', 4);
  }

  private collide(ship: Ship, normal: THREE.Vector3): void {
    const vn = ship.vel.dot(normal);
    if (vn >= 0) return;
    const impact = -vn;
    ship.vel.addScaledVector(normal, -vn * 1.35);
    ship.vel.multiplyScalar(0.82);
    ship.angVel.add(_v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(impact * 0.02));
    const point = _v2.copy(ship.pos).addScaledVector(normal, -ship.radius);
    if (impact > 6) this.fx.sparks(point, normal, '#ffd080', Math.min(40, Math.floor(impact / 3)), 40 + impact);
    const dmg = Math.max(0, impact - 14) * 0.9;
    if (ship.isPlayer) {
      if (impact > 6) this.audio.scrape(impact / 90);
      this.shake += Math.min(1.5, impact / 60);
      if (dmg > 0) this.damageFlash = Math.min(1, this.damageFlash + dmg / 60);
    }
    if (dmg > 0 && ship.damage(dmg, null)) this.destroyShip(ship, null);
  }

  private moveShip(ship: Ship, dt: number): void {
    const len = ship.vel.length() * dt;
    let collided = false;
    if (len > 1e-5) {
      _v3.copy(ship.vel).normalize();
      if (this.world.raycast(ship.pos, _v3, len, ship.radius, hit)) {
        ship.pos.addScaledVector(_v3, Math.max(0, hit.t - 0.05));
        const remaining = len - hit.t;
        this.collide(ship, hit.normal);
        _v3.addScaledVector(hit.normal, -_v3.dot(hit.normal));
        ship.pos.addScaledVector(_v3, remaining * 0.5);
        collided = true;
      } else ship.pos.addScaledVector(ship.vel, dt);
    }
    if (this.world.resolveSphere(ship.pos, ship.radius, _n) > 0 && !collided) this.collide(ship, _n);
  }

  private shipVsShip(): void {
    const list = this.ships;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const r = a.radius + b.radius;
        const d2 = a.pos.distanceToSquared(b.pos);
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 0.01;
        _n.subVectors(a.pos, b.pos).divideScalar(d);
        const push = (r - d) / 2;
        a.pos.addScaledVector(_n, push);
        b.pos.addScaledVector(_n, -push);
        const rel = _v.subVectors(a.vel, b.vel).dot(_n);
        if (rel < 0) {
          const ma = a.radius * a.radius;
          const mb = b.radius * b.radius;
          a.vel.addScaledVector(_n, (-rel * mb) / (ma + mb) * 1.3);
          b.vel.addScaledVector(_n, (rel * ma) / (ma + mb) * 1.3);
          const dmg = Math.max(0, -rel - 10) * 0.6;
          this.fx.sparks(_v2.copy(b.pos).addScaledVector(_n, b.radius), _n, '#ffd080', 12);
          if (a.isPlayer || b.isPlayer) {
            this.audio.scrape(-rel / 80);
            this.shake += 0.6;
          }
          if (dmg > 0) {
            if (a.damage(dmg * (mb / (ma + mb)) * 2, b)) this.destroyShip(a, b);
            if (b.damage(dmg * (ma / (ma + mb)) * 2, a)) this.destroyShip(b, a);
          }
        }
      }
    }
  }

  private step(dt: number): void {
    this.missionTime += dt;
    for (const s of this.ships) {
      if (!s.alive) continue;
      if (s.ai) s.ai.update(s, dt);
      s.updateFlight(dt);
      this.moveShip(s, dt);
      if (!s.alive) continue;
      if (s.controls.fire) this.fireGuns(s);
      if (s.controls.missile) this.fireMissile(s);
      if (s.isPlayer) s.controls.missile = false;
    }
    this.shipVsShip();
    this.bolts.update(dt, this);
    this.missiles.update(dt, this);
    this.ships = this.ships.filter((s) => s.alive || s.isPlayer);
  }

  private updatePlayerSystems(dt: number): void {
    const p = this.player;
    if (!p || !p.alive) {
      this.audio.setLock('none');
      this.audio.setMissileWarning(0);
      return;
    }
    // lead & lock
    const t = p.target;
    this.hasLead = false;
    if (t && !t.alive) p.target = null;
    if (p.target) {
      const tt = p.target;
      _v.subVectors(tt.pos, p.pos);
      const dist = _v.length();
      const ti = interceptTime(_v, _v2.subVectors(tt.vel, p.vel), p.cls.gun.boltSpeed);
      if (ti > 0 && dist < 1600) {
        this.lead.copy(tt.pos).addScaledVector(tt.vel, ti).addScaledVector(p.vel, -ti);
        this.hasLead = true;
      }
      p.forward(_v2);
      const angle = _v2.angleTo(_v.normalize());
      if (p.missiles > 0 && dist < 1600 && angle < 0.24) this.lockProgress = Math.min(1, this.lockProgress + dt / 1.1);
      else this.lockProgress = Math.max(0, this.lockProgress - dt * 2.5);
    } else this.lockProgress = 0;
    this.audio.setLock(this.lockProgress >= 1 ? 'locked' : this.lockProgress > 0 ? 'locking' : 'none');

    const incoming = this.missiles.incoming(p);
    let warn = 0;
    for (const m of incoming) warn = Math.max(warn, 1 - m.pos.distanceTo(p.pos) / 900);
    this.audio.setMissileWarning(incoming.length ? Math.max(0.05, warn) : 0);

    // near misses with other ships
    for (const s of this.ships) {
      if (s === p || !s.alive) continue;
      const d = s.pos.distanceTo(p.pos);
      const until = this.whooshCooldown.get(s.id) ?? 0;
      if (d < 40 + s.radius && this.time > until) {
        const rel = _v.subVectors(s.vel, p.vel).length();
        if (rel > 50) {
          this.audio.whoosh(s.pos, clamp(rel / 200, 0.2, 0.9));
          this.whooshCooldown.set(s.id, this.time + 1.5);
        }
      }
    }

    // boundary
    const r = p.pos.length();
    if (r > ARENA_LIMIT) {
      this.boundaryTimer += dt;
      if (this.boundaryTimer > 1) {
        this.boundaryTimer = 0;
        if (p.damage(25, null)) this.destroyShip(p, null);
        this.damageFlash = 0.6;
      }
    }
  }

  private updateCamera(dt: number): void {
    const p = this.player;
    if (this.state === 'title' || !p) {
      this.titleAngle += dt * 0.05;
      const r = 900;
      this.camera.position.set(Math.cos(this.titleAngle) * r, 180 + Math.sin(this.titleAngle * 0.7) * 120, Math.sin(this.titleAngle) * r);
      this.camera.lookAt(0, 60, 0);
      return;
    }
    if (p.alive) {
      if (this.cockpit) {
        this.camQuat.copy(p.quat);
        this.camera.position.copy(p.toWorld(_v.set(0, 1.0, -1.2), _v2));
      } else {
        this.camQuat.slerp(p.quat, dampFactor(p.sliding ? 6 : 9, dt));
        const off = _v.copy(p.model.cameraOffset);
        off.z += p.boosting ? 2.5 : 0;
        off.applyQuaternion(this.camQuat);
        const len = off.length();
        _v2.copy(off).divideScalar(len);
        let dist = len;
        if (this.world.raycast(p.pos, _v2, len, 1.2, hit)) dist = Math.max(2, hit.t);
        this.camera.position.copy(p.pos).addScaledVector(_v2, dist);
      }
      p.model.group.visible = !this.cockpit;
    }
    this.camera.quaternion.copy(this.camQuat);
    // lean the view a touch towards the target of a roll for feel
    if (this.shake > 0.001) {
      const s = Math.min(this.shake, 2) * 0.35;
      this.camera.position.add(_v.set(rand(-s, s), rand(-s, s), rand(-s, s)));
      this.shake = Math.max(0, this.shake - dt * 3);
    }
    const speedFrac = p.speed / p.cls.maxSpeed;
    const fov = 70 + clamp(speedFrac - 1, 0, 1) * 14;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * dampFactor(4, dt);
      this.camera.updateProjectionMatrix();
      this.fx.particles.setViewport(window.innerHeight * this.renderer.getPixelRatio(), this.camera.fov);
    }
  }

  private updateBeacons(): void {
    const c = new THREE.Color();
    for (let i = 0; i < this.beacons.length; i++) {
      const b = this.beacons[i];
      const k = Math.sin(this.time * 3 + b.phase * 7) > 0.6 ? 3.2 : 0.25;
      this.beaconMesh.setColorAt(i, c.copy(b.color).multiplyScalar(k));
    }
    if (this.beaconMesh.instanceColor) this.beaconMesh.instanceColor.needsUpdate = true;
  }

  /** One rendered frame. */
  frame(rawDt: number): void {
    this.update(rawDt);
    this.render();
    this.input.endFrame();
  }

  /** Test hook: hands the player ship to an AI pilot. */
  enableAutopilot(skill = 0.9): void {
    if (this.player) this.player.ai = new AIPilot(this, skill);
  }

  /**
   * Test hook: advances the simulation without rendering. Yields to the microtask queue
   * between steps so `await`-based mission scripts progress as they would between frames.
   */
  async simulate(seconds: number, step = 1 / 60): Promise<void> {
    for (let t = 0; t < seconds; t += step) {
      this.update(step);
      this.input.endFrame();
      for (let k = 0; k < 12; k++) await null;
    }
  }

  private update(rawDt: number): void {
    const dt = Math.min(rawDt, 1 / 20);
    this.time += dt;
    this.fpsAccum += rawDt;
    this.fpsFrames++;
    if (this.fpsAccum > 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
    this.input.poll();

    if (this.state === 'title') {
      if (this.input.pressed('confirm')) this.onTitleConfirm?.();
    } else if (this.state === 'playing') {
      if (this.input.pressed('pause')) this.pause();
    } else if (this.state === 'paused') {
      if (this.input.pressed('pause') || this.input.pressed('confirm')) this.resume();
    }

    if (this.state === 'playing') {
      this.applyPlayerInput(dt);
      const steps = Math.ceil(dt / (1 / 90));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) this.step(h);
      this.updatePlayerSystems(dt);
      // resolve waiters
      const ready = this.waiters.filter((w) => w.until());
      if (ready.length) {
        this.waiters = this.waiters.filter((w) => !ready.includes(w));
        for (const w of ready) w.resolve();
      }
      this.comms.update(dt);
      if (this.hintTimer > 0) {
        this.hintTimer -= dt;
        if (this.hintTimer <= 0) this.hintText = null;
      }
      this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);
    }

    if (this.state !== 'paused') {
      for (const s of this.ships) if (s.alive) s.updateVisuals(dt, this.fx, this.time);
      this.fx.update(dt);
    }
    this.updateCamera(dt);
    this.bolts.eye.copy(this.camera.position);
    this.updateBeacons();
    const p = this.player;
    const vel = p && p.alive && this.state !== 'title' ? p.vel : _v.set(0, 0, 0);
    this.dust.update(this.camera.position, vel);
    this.dust.mesh.visible = this.state !== 'title';
    this.sky.update(this.camera);

    // audio
    if (this.audio.ready) {
      this.audio.setListener(this.camera.position, this.camera.quaternion);
      let prox = 0;
      let pan = 0;
      if (p && p.alive && this.state === 'playing') {
        const d = this.world.nearestSurface(p.pos, 70, _n);
        if (d < 70) {
          prox = (1 - d / 70) * clamp(p.speed / 110, 0, 1.4);
          _q.copy(this.camera.quaternion).invert();
          pan = -_v.copy(_n).applyQuaternion(_q).x;
          if (prox > 0.5) this.shake = Math.max(this.shake, (prox - 0.5) * 0.25);
        }
      }
      this.audio.update(dt, {
        speed: p ? clamp(p.speed / (p.cls.boostSpeed || 1), 0, 1) : 0,
        thrust: p ? p.thrust : 0,
        boost: p ? p.boosting : false,
        proximity: prox,
        windPan: pan,
        active: this.state === 'playing' && !!p && p.alive,
      });
      const hostilesNear = p ? this.ships.filter((s) => s.alive && hostile(p.faction, s.faction) && s.pos.distanceTo(p.pos) < 1800).length : 0;
      const target = this.state === 'playing' ? Math.max(this.musicIntensity, hostilesNear > 0 ? 0.85 : 0.3) : 0.2;
      this.audio.music.intensity += (target - this.audio.music.intensity) * dampFactor(0.5, dt);
    }

  }

  private render(): void {
    const p = this.player;
    this.composer.render();

    // HUD
    if ((this.state === 'playing' || this.state === 'paused') && p && p.alive) {
      this.hud.draw({
        player: p,
        camera: this.camera,
        ships: this.ships,
        lead: this.hasLead ? this.lead : null,
        lockProgress: this.lockProgress,
        locked: this.lockProgress >= 1,
        incoming: this.missiles.incoming(p).map((m) => m.pos),
        cursor: this.input.pointerLocked && this.input.device === 'mouse' ? this.input.cursor : null,
        objective: this.objective,
        hint: this.hintText,
        boundary: p.pos.length() > ARENA_WARN,
        damageFlash: this.damageFlash,
        time: this.time,
        gamepad: this.input.device === 'gamepad',
      });
    } else this.hud.clear();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.silenceLoops();
    this.input.exitPointerLock();
    if ('speechSynthesis' in window) window.speechSynthesis.pause();
    this.onPauseChange?.(true);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    if (this.input.device === 'mouse') this.input.requestPointerLock();
    if ('speechSynthesis' in window) window.speechSynthesis.resume();
    this.onPauseChange?.(false);
  }

  onPauseChange: ((paused: boolean) => void) | null = null;
  onTitleConfirm: (() => void) | null = null;

  get containerElement(): HTMLElement {
    return this.container;
  }
}
