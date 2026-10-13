import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AudioEngine, type LaserKind } from '../core/audio';
import { Input } from '../core/input';
import { AXIS_X, AXIS_Y, AXIS_Z, clamp, dampFactor, interceptTime, rand, raySphere } from '../core/math';
import { CollisionWorld, makeRayHit } from '../world/colliders';
import { GasClouds, Lighting, SUN_DIRECTION, Sky, SpaceDust, buildEnvironment } from '../world/environment';
import { hullMaterials } from '../world/builder';
import { setHullDetail } from '../world/hullMaterial';
import { DynamicResolution, QUALITY_PROFILES, detectQuality, type QualityLevel, type QualityProfile } from '../core/quality';
import { LensPass, SanitizePass } from '../fx/postfx';
import { updateHolograms } from '../world/holograms';
import { buildAsteroids, buildCarrier, buildKestrelStation, type Beacon, type Spinner } from '../world/structures';
import { Effects } from '../fx/effects';
import { POWER, Ship, type PowerMode } from '../entities/ship';
import { DEFAULT_MISSILE, SHIP_CLASSES, type ShipClass } from '../entities/shipClasses';
import type { Fitted } from './loadout';
import { Hangar } from './hangar';
import { FACTIONS, hostile, type FactionId } from '../entities/factions';
import { AIPilot, WaypointPilot } from '../entities/ai';
import { Instructor } from '../entities/instructor';
import { BoltSystem, MissileSystem, type CombatContext } from '../entities/weapons';
import { Hud } from '../ui/hud';
import { Comms } from '../ui/comms';

export type GameState = 'title' | 'hangar' | 'playing' | 'paused' | 'debrief';

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
  flares?: number;
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
  private composer!: EffectComposer;
  private mainPass!: RenderPass;
  /** The between-missions hangar, with its own scene and camera. */
  readonly hangar: Hangar;
  private bloom!: UnrealBloomPass;
  private lens!: LensPass;
  private readonly lighting: Lighting;
  private readonly clouds = new GasClouds();
  quality: QualityProfile = QUALITY_PROFILES.medium;
  /** Player-facing glow multiplier (bloom and lens flare), 0..1.5. */
  private glow = 1;
  readonly dynamicResolution = new DynamicResolution();
  private sunVis = 0;
  private readonly sunScreen = new THREE.Vector2();
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
  private readonly spinners: Spinner[] = [];
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
  /** Mouse-aim frame: where the player is looking and wants the ship to go. */
  private readonly aimQuat = new THREE.Quaternion();
  private readonly aimPoint = new THREE.Vector3();
  private readonly instructor = new Instructor();
  /** Smoothed angular velocity of the aim direction (world space, rad/s). */
  private readonly aimRate = new THREE.Vector3();
  private readonly prevAimDir = new THREE.Vector3(0, 0, -1);
  /** Seconds the aim frame keeps following the ship's roll after Q/E is released. */
  private rollFollow = 0;
  /** Camera offset driven by the ship's acceleration: it swings out in turns and on boost. */
  private readonly camLag = new THREE.Vector3();
  private readonly prevPlayerVel = new THREE.Vector3();
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
  /** The player's fitted ship for the next sortie (set by the hangar). */
  playerFit: { cls: ShipClass; fitted: Fitted } | null = null;
  /** Bounties earned by the player this sortie. */
  bounties = 0;
  /** Set by the mission runner. */
  onMissionEnd: ((result: 'victory' | 'defeat') => void) | null = null;
  missionRunner: ((game: Game, checkpoint: number) => Promise<void>) | null = null;

  constructor(
    private readonly container: HTMLElement,
    hudCanvas: HTMLCanvasElement,
  ) {
    // antialiasing happens on the post-processing target (MSAA), not the default framebuffer
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    container.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(hudCanvas);
    this.fx = new Effects(this.scene);
    this.bolts = new BoltSystem(this.scene);
    this.missiles = new MissileSystem(this.scene);

    this.lighting = new Lighting(this.scene);
    this.scene.environment = buildEnvironment(this.renderer, this.sky);
    this.scene.environmentIntensity = 0.75;
    this.scene.add(this.dust.mesh);
    this.scene.add(this.clouds.group);

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
    this.spinners.push(...(station.spinners ?? []));
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

    this.hangar = new Hangar(this.scene.environment);
    this.hangar.attachControls(this.renderer.domElement, () => this.state === 'hangar');
    this.comms.radio = () => this.audio.radio;
    window.addEventListener('resize', () => this.resize());
    this.applyQuality(detectQuality(this.renderer));
  }

  /** Switches graphics preset: shadows, AO, MSAA, surface detail, resolution cap. */
  applyQuality(level: QualityLevel): void {
    const q = QUALITY_PROFILES[level];
    const shadowsChanged = this.renderer.shadowMap.enabled !== q.shadows;
    this.quality = q;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.lighting.configureShadows(q.shadows, q.shadowMapSize, q.shadowRange);
    if (shadowsChanged) {
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (m) for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
      });
    }
    setHullDetail(Object.values(hullMaterials), q.surfaceDetail);
    this.hangar?.setShadows(q.shadows);
    this.dynamicResolution.scale = 1;
    this.buildComposer();
    this.resize();
  }

  setGlow(v: number): void {
    this.glow = v;
    if (this.bloom) this.bloom.strength = 0.4 * v;
  }

  private buildComposer(): void {
    this.composer?.dispose();
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.quality.msaa });
    this.composer = new EffectComposer(this.renderer, target);
    const skyPass = new RenderPass(this.sky.scene, this.sky.camera);
    const mainPass = new RenderPass(this.scene, this.camera);
    mainPass.clear = false;
    mainPass.clearDepth = true;
    this.mainPass = mainPass;
    this.composer.addPass(skyPass);
    this.composer.addPass(mainPass);
    this.composer.addPass(new SanitizePass());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4 * this.glow, 0.4, 1.0);
    this.composer.addPass(this.bloom);
    this.lens = new LensPass();
    this.composer.addPass(this.lens);
    this.composer.addPass(new OutputPass());
  }

  private get pixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, this.quality.pixelRatioCap) * this.dynamicResolution.scale;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.hangar?.resize(w, h);
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
    classId: string | ShipClass,
    faction: FactionId,
    name: string,
    pos: THREE.Vector3,
    lookAt: THREE.Vector3,
    opts: SpawnOptions = {},
  ): Ship {
    const ship = new Ship(typeof classId === 'string' ? SHIP_CLASSES[classId] : classId, faction, name);
    ship.placeAt(pos, lookAt, opts.speed ?? ship.cls.maxSpeed * 0.8);
    if (opts.skill !== undefined) {
      const ai = new AIPilot(this, opts.skill);
      ai.playerBias = opts.playerBias ?? 0.5;
      ai.patrolPoint.copy(this.points['station.hub'] ?? new THREE.Vector3());
      ship.ai = ai;
    }
    ship.invulnerable = opts.invulnerable ?? false;
    ship.damageScale = opts.damageScale ?? 1;
    ship.flares = opts.flares ?? 0;
    this.scene.add(ship.root);
    this.ships.push(ship);
    return ship;
  }

  /** Civilian haulers on slow loops through the area: moving cover and something to dodge. */
  private spawnTraffic(): void {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const routes: [THREE.Vector3[], string][] = [
      [[v(800, -120, 0), v(560, -60, 560), v(0, -20, 800), v(-560, -60, 560), v(-800, -120, 0), v(-560, -180, -560), v(0, -220, -800), v(560, -180, -560)], 'Bulk Hauler Ostrava'],
      [[v(-1400, 300, -400), v(-600, 260, -1000), v(500, 200, -1150), v(1050, 120, -250), v(500, 150, 750), v(-300, 250, 1000)], 'Bulk Hauler Tamsin'],
    ];
    for (const [points, name] of routes) {
      const start = points[0];
      const ship = this.spawnShip('freighter', 'drift', name, start.clone(), points[1], { speed: 35 });
      ship.ai = new WaypointPilot(points, 0.85);
      ship.invulnerable = true;
    }
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
    this.comms.setPaused(false);
    this.comms.preloadVoices();
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
    this.bounties = 0;

    const fit = this.playerFit;
    const player = this.spawnShip(
      fit ? fit.cls : 'kite',
      'player',
      'Rook',
      new THREE.Vector3(140, 60, 560),
      new THREE.Vector3(0, 40, 0),
      { speed: 40 },
    );
    player.isPlayer = true;
    if (fit) for (const e of fit.fitted.equipment) player.equipment.add(e);
    player.flares = player.equipment.has('flares') ? 10 : 0;
    player.controls.throttle = 0.4;
    this.player = player;
    this.spawnTraffic();
    this.camQuat.copy(player.quat);
    this.aimQuat.copy(player.quat);
    this.instructor.reset();
    this.aimRate.set(0, 0, 0);
    player.forward(this.prevAimDir);
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
    if (hadShields) ship.shieldImpact(point);
    // impacts shove the hull: light ships get knocked around, the gunship barely notices
    const mass = Math.max(1, ship.radius * ship.radius * 0.1);
    _v.subVectors(ship.pos, point).normalize();
    ship.vel.addScaledVector(_v, (kind === 'missile' ? 24 : damage * 0.35) / mass);
    ship.angVel.add(_v2.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar((kind === 'missile' ? 1.4 : 0.12) / mass));
    if (ship.isPlayer) this.camLag.addScaledVector(_v, kind === 'missile' ? 1.5 : 0.25);
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
    if (by?.isPlayer && !ship.isPlayer) this.bounties += ship.cls.bounty ?? 300;
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
    if (this.input.mouseAimActive) {
      // Mouse aim: the mouse turns the aim frame, the instructor flies the ship towards it.
      const d = this.input.takeAimDelta();
      this.aimQuat.multiply(_q.setFromAxisAngle(AXIS_Y, -d.x));
      this.aimQuat.multiply(_q.setFromAxisAngle(AXIS_X, -d.y));
      // Q/E roll the ship itself; the aim frame (and so the camera) rolls along with it, and
      // keeps following until the roll has settled, so the instructor never rolls it back.
      const rolling = Math.abs(f.roll) > 0.05;
      this.rollFollow = rolling ? 0.6 : Math.max(0, this.rollFollow - dt);
      if (this.rollFollow > 0) this.aimQuat.multiply(_q.setFromAxisAngle(AXIS_Z, p.angVel.z * dt));
      this.aimQuat.normalize();
      // how fast the reticle is sweeping: mouse deltas arrive in bursts, so low-pass it
      const aimDir = _v3.set(0, 0, -1).applyQuaternion(this.aimQuat);
      _n.crossVectors(this.prevAimDir, aimDir).divideScalar(Math.max(dt, 1e-3));
      this.prevAimDir.copy(aimDir);
      this.aimRate.lerp(_n, dampFactor(18, dt));
      const manual = Math.abs(f.pitch) > 0.05 || Math.abs(f.yaw) > 0.05;
      // The aim point hangs off the ship, not the camera, so camera sway can never feed back
      // into where the ship is told to fly.
      this.aimPoint.copy(p.pos).addScaledVector(_v.set(0, 0, -1).applyQuaternion(this.aimQuat), 1000);
      if (manual) {
        // keyboard pitch/yaw override the instructor; the aim frame follows the nose meanwhile
        c.pitch = f.pitch;
        c.yaw = f.yaw;
        c.roll = f.roll;
        this.aimQuat.slerp(p.quat, dampFactor(6, dt));
      } else {
        const aimUp = _v2.set(0, 1, 0).applyQuaternion(this.aimQuat);
        // fly towards the aim point (1 km out along the aim)
        _v3.subVectors(this.aimPoint, p.pos).normalize();
        this.instructor.fly(p, _v3, aimUp, this.aimRate);
        if (rolling) c.roll = f.roll;
        else if (this.rollFollow > 0) c.roll = 0;
      }
    } else {
      this.input.takeAimDelta();
      this.aimQuat.slerp(p.quat, dampFactor(8, dt));
      c.pitch = f.pitch;
      c.yaw = f.yaw;
      c.roll = f.roll;
    }
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
    if (this.input.pressed('flares')) this.dropFlare(p);
    const power: [Parameters<Input['pressed']>[0], PowerMode][] = [
      ['powerShields', 'shields'],
      ['powerGuns', 'guns'],
      ['powerEngines', 'engines'],
      ['powerBalanced', 'balanced'],
    ];
    for (const [action, mode] of power) {
      if (this.input.pressed(action)) this.setPower(p, p.power === mode ? 'balanced' : mode);
    }
    if (this.input.pressed('powerCycle')) {
      const order: PowerMode[] = ['balanced', 'shields', 'guns', 'engines'];
      this.setPower(p, order[(order.indexOf(p.power) + 1) % order.length]);
    }
    if (this.input.pressed('targetNearest')) this.cycleTarget(true);
    if (this.input.pressed('targetNext')) this.cycleTarget(false);
    if (this.input.pressed('camera')) this.cockpit = !this.cockpit;
    if (this.input.pressed('centerMouse')) {
      this.input.centerCursor();
      this.aimQuat.copy(p.quat);
    }
  }

  dropFlare(ship: Ship): void {
    if (ship.flares <= 0) {
      if (ship.isPlayer) this.audio.blip(300, 0.08, 0.08);
      return;
    }
    ship.flares--;
    this.missiles.dropFlare(ship, this);
  }

  private setPower(p: Ship, mode: PowerMode): void {
    p.power = mode;
    this.audio.blip(mode === 'balanced' ? 900 : mode === 'shields' ? 1200 : mode === 'guns' ? 1500 : 1800, 0.08, 0.06);
  }

  private cycleTarget(nearest: boolean): void {
    const p = this.player;
    if (!p) return;
    const enemies = this.ships.filter((s) => s.alive && s !== p && !s.cls.civilian && hostile(p.faction, s.faction));
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
    const pw = POWER[ship.power];
    const cost = gun.energyCost * pw.gunCost;
    if (ship.gunTimer > 0 || ship.energy < cost) return;
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
        const assist = (this.input.device === 'gamepad' ? 0.07 : 0.035) * (ship.equipment.has('targeting') ? 2 : 1);
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
    ship.gunTimer = gun.cooldown * pw.gunRate;
    ship.energy -= cost;
    if (ship.isPlayer) {
      this.shake = Math.max(this.shake, 0.1);
      this.camLag.addScaledVector(_v, -0.06);
    }
    ship.shotsFired++;
    const palette = FACTIONS[ship.faction].palette;
    const pellets = gun.pellets ?? 1;
    for (let i = 0; i < pellets; i++) {
      const d = _v.copy(dir);
      if (pellets > 1) {
        const sp = gun.spread ?? 0.03;
        d.x += rand(-sp, sp);
        d.y += rand(-sp, sp);
        d.z += rand(-sp, sp);
        d.normalize();
      }
      const vel = _n.copy(d).multiplyScalar(gun.boltSpeed * (pellets > 1 ? rand(0.95, 1.05) : 1)).add(ship.vel);
      this.bolts.spawn(origin, vel, gun.damage, ship, palette.bolt, gun.range, gun.boltScale ?? 1);
    }
    this.fx.particles.emit(origin, ship.vel, {
      life: 0.06,
      size0: 4,
      size1: 2,
      color0: new THREE.Color(palette.bolt).multiplyScalar(3),
      color1: new THREE.Color(palette.bolt),
    });
    const kind: LaserKind = ship.isPlayer
      ? gun.sound && gun.sound !== 'pulse'
        ? gun.sound
        : 'player'
      : gun.turretArc !== undefined
        ? 'heavy'
        : ship.faction === 'wake'
          ? 'enemy'
          : 'ally';
    this.audio.laser(ship.isPlayer ? null : origin, kind);
  }

  private fireMissile(ship: Ship): void {
    if (ship.missiles <= 0) return;
    const spec = ship.cls.missile ?? DEFAULT_MISSILE;
    const guided = spec.lockTime > 0;
    const target = ship.target && ship.target.alive ? ship.target : null;
    if (guided && !target) return;
    if (ship.isPlayer) {
      if ((guided && this.lockProgress < 1) || ship.missileTimer > 0) {
        if (ship.missileTimer <= 0) this.audio.blip(300, 0.1, 0.1);
        return;
      }
      ship.missileTimer = spec.refire;
    }
    ship.missiles--;
    for (let i = 0; i < spec.salvo; i++) this.missiles.launch(ship, target, this, spec, i, spec.salvo);
    if (target?.isPlayer && this.checkpoint >= 0) {
      this.hint(
        target.flares > 0
          ? `Missile inbound! Drop a flare (${this.input.label('flares')}) or break hard through the structures`
          : 'Missile inbound! Break hard or weave through structures to shake it',
        4,
      );
    }
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
      if (this.world.raycast(ship.pos, _v3, len, ship.collisionRadius, hit)) {
        ship.pos.addScaledVector(_v3, Math.max(0, hit.t - 0.05));
        const remaining = len - hit.t;
        this.collide(ship, hit.normal);
        _v3.addScaledVector(hit.normal, -_v3.dot(hit.normal));
        ship.pos.addScaledVector(_v3, remaining * 0.5);
        collided = true;
      } else ship.pos.addScaledVector(ship.vel, dt);
    }
    if (this.world.resolveSphere(ship.pos, ship.collisionRadius, _n) > 0 && !collided) this.collide(ship, _n);
  }

  private shipVsShip(): void {
    const list = this.ships;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        // broad phase on bounding radii, then the hit-sphere chains
        const reach = a.radius + b.radius + 60;
        if (a.pos.distanceToSquared(b.pos) > reach * reach) continue;
        let contact = false;
        for (const sa of a.spheres) {
          for (const sb of b.spheres) {
            const r = sa.r + sb.r;
            const d2 = sa.c.distanceToSquared(sb.c);
            if (d2 >= r * r) continue;
            const d = Math.sqrt(d2) || 0.01;
            _n.subVectors(sa.c, sb.c).divideScalar(d);
            this.resolveShipContact(a, b, r - d);
            contact = true;
            break;
          }
          if (contact) break;
        }
      }
    }
  }

  /** Separates two ships along `_n` (pointing from b to a) and applies bounce and damage. */
  private resolveShipContact(a: Ship, b: Ship, overlap: number): void {
    const ma = a.radius * a.radius;
    const mb = b.radius * b.radius;
    a.pos.addScaledVector(_n, (overlap * mb) / (ma + mb));
    b.pos.addScaledVector(_n, (-overlap * ma) / (ma + mb));
    a.updateSpheres();
    b.updateSpheres();
    const rel = _v.subVectors(a.vel, b.vel).dot(_n);
    if (rel >= 0) return;
    a.vel.addScaledVector(_n, ((-rel * mb) / (ma + mb)) * 1.3);
    b.vel.addScaledVector(_n, ((rel * ma) / (ma + mb)) * 1.3);
    const dmg = Math.max(0, -rel - 10) * 0.6;
    this.fx.sparks(_v2.copy(a.pos).addScaledVector(_n, -a.radius * 0.5), _n, '#ffd080', 12);
    if (a.isPlayer || b.isPlayer) {
      this.audio.scrape(-rel / 80);
      this.shake += 0.6;
    }
    if (dmg > 0) {
      if (a.damage(dmg * (mb / (ma + mb)) * 2, b)) this.destroyShip(a, b);
      if (b.damage(dmg * (ma / (ma + mb)) * 2, a)) this.destroyShip(b, a);
    }
  }


  private step(dt: number): void {
    this.missionTime += dt;
    for (const s of this.ships) {
      if (!s.alive) continue;
      if (s.ai) s.ai.update(s, dt);
      s.updateFlight(dt);
      this.moveShip(s, dt);
      s.updateSpheres();
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
      const lockTime = (p.cls.missile ?? DEFAULT_MISSILE).lockTime;
      if (lockTime > 0 && p.missiles > 0 && dist < 1600 && angle < 0.24) this.lockProgress = Math.min(1, this.lockProgress + dt / lockTime);
      else this.lockProgress = Math.max(0, this.lockProgress - dt * 2.5);
    } else this.lockProgress = 0;
    this.audio.setLock(this.lockProgress >= 1 ? 'locked' : this.lockProgress > 0 ? 'locking' : 'none');

    if (p.shieldCellFired) {
      p.shieldCellFired = false;
      this.audio.blip(660, 0.15, 0.25);
      this.hint('Emergency shield cell discharged', 2.5);
    }
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
      const mouseAim = this.input.mouseAimActive;
      if (this.cockpit) {
        this.camQuat.copy(mouseAim ? this.aimQuat : p.quat);
        this.camera.position.copy(p.toWorld(_v.set(0, 1.0, -1.2), _v2));
      } else {
        // in mouse aim the camera looks where you aim; otherwise it trails the ship's nose
        // Mouse aim: the camera IS the aim, 1:1 with the mouse, with no smoothing to drag against.
        if (mouseAim) this.camQuat.copy(this.aimQuat);
        else this.camQuat.slerp(p.quat, dampFactor(p.sliding ? 6 : 9, dt));
        const off = _v.copy(p.model.cameraOffset);
        off.z += p.boosting ? 2.5 : 0;
        off.applyQuaternion(this.camQuat);
        const len = off.length();
        _v2.copy(off).divideScalar(len);
        let dist = len;
        if (this.world.raycast(p.pos, _v2, len, 1.2, hit)) dist = Math.max(2, hit.t);
        this.camera.position.copy(p.pos).addScaledVector(_v2, dist);
        // acceleration lag: the camera is pushed opposite the ship's acceleration, then springs back
        // Mostly fore-aft (boost and braking); the sideways part from hard turns is kept small,
        // since it flips around during manoeuvres and made the ship jump about on screen.
        _v3.subVectors(p.vel, this.prevPlayerVel).divideScalar(Math.max(dt, 1e-3));
        this.prevPlayerVel.copy(p.vel);
        p.forward(_n);
        const along = _v3.dot(_n);
        _v3.addScaledVector(_n, -along).multiplyScalar(-0.002).addScaledVector(_n, -along * 0.009);
        if (_v3.length() > 2.2) _v3.setLength(2.2);
        this.camLag.lerp(_v3, dampFactor(3, dt));
        this.camera.position.add(this.camLag);
        if (p.boosting) this.shake = Math.max(this.shake, 0.22);
      }
      p.model.group.visible = !this.cockpit;
    }
    this.camera.quaternion.copy(this.camQuat);
    if (this.shake > 0.001) {
      const s = Math.min(this.shake, 2);
      this.camera.position.add(_v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(s * 0.3));
      // a little rotational jitter sells impacts far better than translation alone
      _q.setFromEuler(new THREE.Euler(rand(-1, 1) * s * 0.006, rand(-1, 1) * s * 0.006, rand(-1, 1) * s * 0.01));
      this.camera.quaternion.multiply(_q);
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
    const m = new THREE.Matrix4();
    let moved = false;
    for (let i = 0; i < this.beacons.length; i++) {
      const b = this.beacons[i];
      let k: number;
      if (b.kind === 'chase') {
        const t = (((this.time * 1.4 - b.phase * 0.09) % 1) + 1) % 1;
        k = t < 0.1 ? 3.6 : 0.12;
      } else k = Math.sin(this.time * 3 + b.phase * 7) > 0.6 ? 3.2 : 0.25;
      this.beaconMesh.setColorAt(i, c.copy(b.color).multiplyScalar(k));
      if (b.parent) {
        _v.copy(b.position).applyMatrix4(b.parent.matrixWorld);
        this.beaconMesh.setMatrixAt(i, m.makeTranslation(_v.x, _v.y, _v.z));
        moved = true;
      }
    }
    if (this.beaconMesh.instanceColor) this.beaconMesh.instanceColor.needsUpdate = true;
    if (moved) this.beaconMesh.instanceMatrix.needsUpdate = true;
  }

  /** Spins the habitat ring and sensor dish, then refreshes their collision transforms. */
  private updateSpinners(dt: number): void {
    updateHolograms(this.time);
    for (const s of this.spinners) s.object.rotation.y += s.speed * dt;
    this.world.sync();
  }

  /** One rendered frame. */
  frame(rawDt: number): void {
    if (this.state === 'playing' && this.dynamicResolution.update(rawDt)) this.resize();
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
    if (this.state !== 'paused') this.updateSpinners(dt);
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
      if ((this.input.pressed('pause') || this.input.pressed('confirm')) && !this.menuOpen()) this.resume();
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

    if (this.state === 'hangar') {
      this.hangar.update(dt);
      this.sky.update(this.hangar.camera);
      if (this.audio.ready) {
        this.audio.update(dt, { speed: 0, thrust: 0, boost: false, proximity: 0, windPan: 0, active: false });
        this.audio.music.intensity += (0.15 - this.audio.music.intensity) * dampFactor(0.5, dt);
      }
      return;
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
    if (this.state === 'hangar') {
      this.mainPass.scene = this.hangar.scene;
      this.mainPass.camera = this.hangar.camera;
      this.lens.set({ time: this.time, boost: 0, damage: 0, sun: this.sunScreen, sunVis: 0, aspect: this.camera.aspect });
      this.composer.render();
      this.hud.clear();
      return;
    }
    this.mainPass.scene = this.scene;
    this.mainPass.camera = this.camera;
    const p = this.player;
    this.lighting.update(p && p.alive && this.state !== 'title' ? p.pos : this.camera.position);
    this.clouds.update(this.camera.position);
    this.updateSunFlare();
    this.lens.set({
      time: this.time,
      boost: p && p.alive && p.boosting && this.state === 'playing' ? 1 : 0,
      damage: this.damageFlash,
      sun: this.sunScreen,
      sunVis: this.quality.lensFlare ? this.sunVis * 0.55 * this.glow : 0,
      aspect: this.camera.aspect,
    });
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
        cursor:
          this.input.pointerLocked && this.input.device === 'mouse' && this.input.settings.mouseMode === 'stick'
            ? this.input.cursor
            : null,
        aim: this.input.mouseAimActive ? this.aimPoint : null,
        objective: this.objective,
        hint: this.hintText,
        boundary: p.pos.length() > ARENA_WARN,
        damageFlash: this.damageFlash,
        time: this.time,
        gamepad: this.input.device === 'gamepad',
      });
    } else this.hud.clear();
  }

  /** Sun position on screen and how visible it is (structures and ships occlude it). */
  private updateSunFlare(): void {
    const target = _v.copy(SUN_DIRECTION).multiplyScalar(5000).add(this.camera.position);
    _v2.copy(target).project(this.camera);
    let vis = 0;
    if (_v2.z < 1 && Math.abs(_v2.x) < 1.3 && Math.abs(_v2.y) < 1.3) {
      vis = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(_v2.x), Math.abs(_v2.y)), 0.9, 1.3);
      if (this.world.raycast(this.camera.position, SUN_DIRECTION, 4000, 0, hit)) vis = 0;
      else {
        for (const s of this.ships) {
          if (s.alive && raySphere(this.camera.position, SUN_DIRECTION, s.pos, s.radius * 0.8, 4000) >= 0) {
            vis = 0;
            break;
          }
        }
      }
    }
    this.sunScreen.set(_v2.x * 0.5 + 0.5, _v2.y * 0.5 + 0.5);
    this.sunVis += (vis - this.sunVis) * 0.25;
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.silenceLoops();
    this.input.exitPointerLock();
    this.comms.setPaused(true);
    if ('speechSynthesis' in window) window.speechSynthesis.pause();
    this.onPauseChange?.(true);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    if (this.input.device === 'mouse') this.input.requestPointerLock();
    this.comms.setPaused(false);
    if ('speechSynthesis' in window) window.speechSynthesis.resume();
    this.onPauseChange?.(false);
  }

  onPauseChange: ((paused: boolean) => void) | null = null;
  /** Set by the UI: true while an options/controls menu is open. */
  menuOpen: () => boolean = () => false;

  /** Leaves any mission and shows the hangar. */
  enterHangar(): void {
    this.quitToTitle();
    this.state = 'hangar';
  }

  /** Abandons the mission and returns to the orbiting title camera. */
  quitToTitle(): void {
    this.missionToken++;
    for (const w of this.waiters) w.reject(new MissionAbort());
    this.waiters = [];
    this.comms.clear();
    for (const s of this.ships) s.dispose(this.scene);
    this.ships = [];
    this.player = null;
    this.bolts.clear();
    this.missiles.clear();
    this.objective = '';
    this.hintText = null;
    this.audio.silenceLoops();
    this.audio.setLock('none');
    this.audio.setMissileWarning(0);
    this.input.exitPointerLock();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.state = 'title';
  }
  onTitleConfirm: (() => void) | null = null;

  get containerElement(): HTMLElement {
    return this.container;
  }
}
