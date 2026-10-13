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
import type { Beacon, Spinner } from '../world/structures';
import { LOCATIONS, type Location } from '../world/locations';
import { Effects } from '../fx/effects';
import { POWER, Ship, type PowerMode } from '../entities/ship';
import { DEFAULT_MISSILE, SHIP_CLASSES, type GunSpec, type MissileSpec, type ShipClass } from '../entities/shipClasses';
import type { Fitted } from './loadout';
import { Hangar } from './hangar';
import { CapitalShip } from '../entities/capitalShip';
import type { CapitalKind } from '../world/capitals';
import { DockPilot, Docking, type DockGuide } from './docking';
import { listContacts, readout, type Contact, type ScanReadout } from './scanner';
import { FACTIONS, hostile, resetRelations, setHostile, type FactionId } from '../entities/factions';
import { AIPilot, FACTION_TACTICS, TurretAI, WaypointPilot, type Tactic, RoutePilot } from '../entities/ai';
import { Instructor } from '../entities/instructor';
import { BoltSystem, MissileSystem, type CombatContext } from '../entities/weapons';
import { Hud } from '../ui/hud';
import { Comms } from '../ui/comms';


export type Difficulty = 'easy' | 'normal' | 'hard';
/** Damage the player takes, and how much sharper (or duller) hostile pilots and gunners fly. */
/** Seconds for a built-in flare to come back (up to two). */
const FLARE_RECHARGE = 20;

export const DIFFICULTY: Record<Difficulty, { damageTaken: number; skill: number }> = {
  easy: { damageTaken: 0.6, skill: -0.12 },
  normal: { damageTaken: 1, skill: 0 },
  hard: { damageTaken: 1.35, skill: 0.1 },
};
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
  /** Fixed gun emplacement AI instead of a pilot. */
  turret?: boolean;
  /** Fighting style; defaults by faction (Wake swarm, Combine stand off, Drift flank). */
  tactic?: Tactic;
}

/** Lowest throttle setting: reverse at a quarter of top speed. */
const REVERSE_THROTTLE = -0.25;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _relVel = new THREE.Vector3();
const _q = new THREE.Quaternion();
const hit = makeRayHit();



const _hp = new THREE.Vector3();
/**
 * Where gun mount `i` fires from. Models list their hardpoints; a fit with more guns than that
 * gets extra hardpoints set out and down from the listed ones, so every fitted gun shows its own
 * bolts instead of firing from the same spot as another.
 */
function gunHardpoint(guns: THREE.Vector3[], i: number): THREE.Vector3 {
  if (i < guns.length) return guns[i];
  const base = guns[i % guns.length];
  const ring = Math.floor(i / guns.length);
  const side = base.x === 0 ? (ring % 2 ? -1 : 1) : Math.sign(base.x);
  return _hp.set(base.x + side * 0.6 * ring, base.y - 0.45 * ring, base.z + 0.4 * ring);
}
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
  points: Record<string, THREE.Vector3> = {};
  private beacons: Beacon[] = [];
  private spinners: Spinner[] = [];
  private beaconMesh: THREE.InstancedMesh | null = null;
  /** The map currently built into the scene. */
  location!: Location;

  ships: Ship[] = [];
  /** Moving capital ships spawned by the current mission. */
  capitals: CapitalShip[] = [];
  player: Ship | null = null;
  state: GameState = 'title';
  time = 0;
  missionTime = 0;
  private checkpointAt = 0;
  /** What you had when you reached each checkpoint: a retry starts you there with the same. */
  private readonly checkpointSaves = new Map<number, { hull: number; missiles: number; flares: number; bounties: number; bonusPay: number; kills: number }>();
  /** Bounties restored from a checkpoint: already paid out at the debrief of the failed attempt. */
  bountiesCarried = 0;

  /** The stage a retry starts from; missions raise it as they go, and each raise is saved. */
  get checkpoint(): number {
    return this.checkpointAt;
  }

  set checkpoint(n: number) {
    const p = this.player;
    if (n > this.checkpointAt && p?.alive && this.state === 'playing') {
      this.checkpointSaves.set(n, { hull: p.hull, missiles: p.missiles, flares: p.flares, bounties: this.bounties, bonusPay: this.bonusPay, kills: p.kills });
    }
    this.checkpointAt = n;
  }
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
  /** Throttle is parked at zero until the throttle-down key is pressed again. */
  private stopDetent = false;
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
  readonly docking: Docking;
  private dockGuide: DockGuide | null = null;
  private dockPilot: DockPilot;
  /** The docking computer is flying (equipment, or the test autopilot). */
  private autoDock = false;
  private autopilot = false;
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

    this.docking = new Docking(this.scene);
    this.dockPilot = new DockPilot(this.world);
    this.loadLocation('kestrel');

    this.hangar = new Hangar(this.scene.environment);
    this.hangar.attachControls(this.renderer.domElement, () => this.state === 'hangar');
    this.comms.radio = () => this.audio.radio;
    window.addEventListener('resize', () => this.resize());
    this.applyQuality(detectQuality(this.renderer));
  }

  /** Builds a location into the scene, replacing the current one (no-op if already loaded). */
  loadLocation(id: string): void {
    if (this.location?.id === id) return;
    if (this.location) {
      this.scene.remove(this.location.group);
      this.location.group.traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        if (g) g.dispose();
      });
    }
    this.world.clear();
    const loc = LOCATIONS[id](this.world);
    this.location = loc;
    this.scene.add(loc.group);
    this.beacons = loc.beacons;
    this.spinners = loc.spinners;
    this.points = loc.points;
    this.docking.setPorts(loc.docks);
    if (this.beaconMesh) {
      this.scene.remove(this.beaconMesh);
      this.beaconMesh.dispose();
    }
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, this.beacons.length));
    mesh.count = this.beacons.length;
    const m = new THREE.Matrix4();
    this.beacons.forEach((bc, i) => {
      mesh.setMatrixAt(i, m.makeTranslation(bc.position.x, bc.position.y, bc.position.z));
      mesh.setColorAt(i, bc.color);
    });
    this.beaconMesh = mesh;
    this.scene.add(mesh);
    // new geometry needs the current shadow setting
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material;
      if (mat) for (const mm of Array.isArray(mat) ? mat : [mat]) mm.needsUpdate = true;
    });
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

  /** Per-frame mission logic (cleared when a mission starts). */
  private frameHooks: ((dt: number) => void)[] = [];
  /** Mission-only scenery (cleared when a mission starts). */
  private decor: THREE.Object3D[] = [];
  /** Scanner selection (by contact key) and what it reads. */
  private scanKey: string | null = null;
  scanReadout: ScanReadout | null = null;
  /** Mission API: HUD markers for gates, pods and other things to fly to. */
  waypoints: { name: string; pos: THREE.Vector3; color?: string }[] = [];
  /** Stealth: detection 0..1 shown on the HUD while set (null = not sneaking). */
  signature: number | null = null;
  /** Set by the UI: lets the player pick one of their ships mid-mission; resolves to its id. */
  onChooseShip: (() => Promise<string | null>) | null = null;
  /** Set by the UI: builds the fitted class for one of the player's ships. */
  fitFor: ((shipId: string) => { cls: ShipClass; fitted: Fitted }) | null = null;

  onFrame(cb: (dt: number) => void): void {
    this.frameHooks.push(cb);
  }

  addDecor(o: THREE.Object3D): void {
    this.scene.add(o);
    this.decor.push(o);
  }

  /**
   * Mission API: freeze the action and let the player pick a ship from their hangar (they are
   * docked), then swap it in where the old one sits. Resolves once the new ship is in place.
   */
  async chooseShip(): Promise<void> {
    if (!this.onChooseShip || !this.fitFor || !this.player) return;
    const token = this.missionToken;
    const prev = this.state;
    this.state = 'paused';
    this.input.exitPointerLock();
    const id = await this.onChooseShip();
    this.checkToken(token);
    this.state = prev === 'paused' ? 'playing' : prev;
    if (this.input.device === 'mouse') this.input.requestPointerLock();
    if (id) this.swapPlayer(this.fitFor(id));
  }

  /** Replaces the player's ship with a freshly fitted one at the same spot. */
  swapPlayer(fit: { cls: ShipClass; fitted: Fitted }): void {
    const old = this.player;
    if (!old) return;
    const ship = new Ship(fit.cls, 'player', 'Rook');
    ship.pos.copy(old.pos);
    ship.quat.copy(old.quat);
    ship.vel.copy(old.vel);
    ship.held = old.held;
    ship.isPlayer = true;
    for (const e of fit.fitted.equipment) ship.equipment.add(e);
    ship.flares = ship.equipment.has('flares') ? 12 : 2;
    ship.kills = old.kills;
    ship.shotsFired = old.shotsFired;
    ship.shotsHit = old.shotsHit;
    ship.syncTransform();
    this.scene.add(ship.root);
    old.dispose(this.scene);
    old.alive = false;
    this.ships = this.ships.filter((s) => s !== old);
    this.ships.push(ship);
    this.player = ship;
    this.playerFit = fit;
  }

  /** Outcome flags the mission records for the campaign ("gallows" -> "burned", ...). */
  missionFlags: Record<string, string> = {};
  /** Extra pay a mission awards on top of the contract (bonuses). */
  bonusPay = 0;
  /** The player's ship was destroyed this mission (as opposed to failing an objective). */
  playerDied = false;
  /** Ship classes that appeared this mission, for the hangar database. */
  readonly seenClasses = new Set<string>();

  /** Holds a ship still on a deck (carrier launch queue). The player can look around meanwhile. */
  park(ship: Ship, pos: THREE.Vector3, look: THREE.Vector3): void {
    ship.placeAt(pos, look, 0);
    ship.controls.throttle = 0;
    ship.held = true;
    if (ship.isPlayer) {
      this.aimQuat.copy(ship.quat);
      this.camQuat.copy(ship.quat);
    }
  }

  /** Releases a parked ship off the catapult at boost speed. */
  catapult(ship: Ship): void {
    ship.held = false;
    ship.forward(_v);
    ship.vel.copy(_v).multiplyScalar(ship.cls.boostSpeed * 1.05);
    ship.controls.throttle = 1;
    if (ship.isPlayer) {
      this.shake += 1.4;
      this.aimQuat.copy(ship.quat);
      this.audio.catapult(null);
    } else {
      this.audio.catapult(ship.pos);
    }
    for (const e of ship.model.engines) {
      ship.toWorld(_v2.copy(e), _v3);
      this.fx.particles.emit(_v3, _n.copy(_v).multiplyScalar(-40), {
        life: 0.6,
        size0: 8,
        size1: 22,
        color0: new THREE.Color(FACTIONS[ship.faction].palette.engine).multiplyScalar(2),
        color1: new THREE.Color('#202030'),
        drag: 2,
        alpha: 0.7,
      });
    }
  }

  /** Opens docking at the given ports (the player requests clearance with the dock key). */
  allowDocking(ids: string[]): void {
    this.docking.allowed = new Set(ids);
  }

  /** Mission API: release the clamps (if landed) and close all docks. */
  closeDocking(): void {
    this.docking.allowed = null;
    this.docking.cancel();
    this.autoDock = false;
    if (this.player) this.player.held = false;
  }

  /** Resolves once the player has landed at one of `ids`. */
  async dock(ids: string[]): Promise<string> {
    this.allowDocking(ids);
    await this.until(() => this.docking.stage === 'docked' && !!this.docking.active && ids.includes(this.docking.active.id));
    return this.docking.active?.id ?? ids[0];
  }

  /** Scan key: steps through every contact in the system, nearest first, then switches off. */
  cycleScan(): void {
    const p = this.player;
    if (!p) return;
    const list = listContacts(p, this.ships, this.capitals, this.points);
    const at = this.scanKey ? list.findIndex((c) => c.key === this.scanKey) : -1;
    const next = list[at + 1];
    this.scanKey = next ? next.key : null;
    this.audio.blip(next ? 1760 : 660, 0.05, 0.05);
    if (!next) this.hint('Scanner off', 1.5);
  }

  /** The contact the scanner is on, if it is open. */
  private scannedContact(): Contact | null {
    const p = this.player;
    if (!p || !this.scanKey) return null;
    return listContacts(p, this.ships, this.capitals, this.points).find((c) => c.key === this.scanKey) ?? null;
  }

  /** Refreshes the scanner readout (the contact may have moved, been hit, or be gone). */
  private updateScan(): void {
    const p = this.player;
    if (!p || !this.scanKey) {
      this.scanReadout = null;
      return;
    }
    const list = listContacts(p, this.ships, this.capitals, this.points);
    const i = list.findIndex((c) => c.key === this.scanKey);
    if (i < 0) {
      this.scanKey = null;
      this.scanReadout = null;
      return;
    }
    this.scanReadout = readout(list[i], p, i, list.length);
  }

  /**
   * Dock key: clearance for the open port you are facing. Pressed again on the approach with
   * more than one port open, it switches to the next one; with a docking computer it engages the
   * autopilot (from the gates on, when several ports are open).
   */
  requestDock(): void {
    const p = this.player;
    if (!p || !p.alive) return;
    const facing = this.camera.getWorldDirection(new THREE.Vector3());
    const choices = this.docking.choices(p.pos, facing);
    const active = this.docking.active;
    if (active) {
      const several = choices.length > 1;
      if (several && this.docking.stage === 'approach' && !this.autoDock) {
        const next = choices[(choices.findIndex((c) => c.id === active.id) + 1) % choices.length];
        this.docking.cancel();
        this.docking.begin(next);
        this.audio.blip(1320, 0.1, 0.06);
        this.hint(`Clearance switched: ${next.name}`, 3);
        return;
      }
      if (p.equipment.has('dockingComputer') || this.autopilot) {
        this.autoDock = !this.autoDock;
        this.hint(this.autoDock ? 'Docking computer engaged' : 'Docking computer off: you have the controls', 2.5);
      } else this.hint(`Cleared for ${active.name}. Follow the gates`, 3);
      return;
    }
    const port = choices[0];
    if (!port) {
      this.audio.blip(300, 0.1, 0.1);
      this.hint(this.docking.allowed ? 'Too far from an open docking bay' : 'No docking clearance right now', 2.5);
      return;
    }
    this.docking.begin(port);
    this.audio.blip(1320, 0.1, 0.06);
    const others = choices.length > 1 ? `. Press ${this.input.label('dock')} again for ${choices[1].name}` : '';
    this.hint(`Docking clearance: ${port.name}. Fly through the gates${others}${p.equipment.has('dockingComputer') && !others ? `, or press ${this.input.label('dock')} again for the docking computer` : ''}`, 6);
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
    if (faction !== 'player') this.seenClasses.add(ship.cls.id);
    ship.placeAt(pos, lookAt, opts.speed ?? ship.cls.maxSpeed * 0.8);
    if (opts.turret) {
      const skill = (opts.skill ?? 0.5) + (hostile('player', faction) ? DIFFICULTY[this.difficulty].skill : 0);
      ship.ai = new TurretAI(this, clamp(skill, 0.15, 0.98), opts.playerBias ?? 0.4);
    } else if (opts.skill !== undefined) {
      const skill = hostile('player', faction) ? clamp(opts.skill + DIFFICULTY[this.difficulty].skill, 0.15, 0.98) : opts.skill;
      const ai = new AIPilot(this, skill);
      ai.tactic = opts.tactic ?? FACTION_TACTICS[faction] ?? 'swarm';
      ai.playerBias = opts.playerBias ?? 0.5;
      ai.patrolPoint.copy(this.points['station.hub'] ?? this.points['gallows.center'] ?? this.location.arena.center);
      ship.ai = ai;
    }
    ship.invulnerable = opts.invulnerable ?? false;
    ship.damageScale = opts.damageScale ?? 1;
    ship.flares = opts.flares ?? 0;
    this.scene.add(ship.root);
    this.ships.push(ship);
    return ship;
  }

  /** The drone bay: two drones on the player's wing. */
  private launchEscorts(player: Ship): void {
    for (const side of [-1, 1]) {
      const p = player.pos.clone().add(new THREE.Vector3(side * 25, 6, 30).applyQuaternion(player.quat));
      const d = this.spawnShip('drone', 'player', 'Your drone', p, p.clone().add(player.forward(new THREE.Vector3()).multiplyScalar(500)), { skill: 0.55, playerBias: 0, speed: 40, damageScale: 0.5 });
      const ai = d.ai as AIPilot;
      ai.wingOf = player;
      ai.tactic = 'swarm';
    }
  }

  /** Civilian haulers on slow loops through the area: moving cover and something to dodge. */
  private spawnTraffic(): void {
    for (const route of this.location.traffic) {
      const pts = route.points;
      const ship = this.spawnShip(route.cls ?? 'freighter', 'drift', route.name, pts[0].clone(), pts[1], { speed: route.speed });
      ship.ai = new WaypointPilot(pts, 0.85);
      ship.invulnerable = true;
    }
  }

  /**
   * Spawns a moving capital ship. Its turrets join the fight as anchored ships of the same
   * faction (they shoot only if `armed`); its docks become available to `allowDocking`.
   */
  spawnCapital(
    kind: CapitalKind,
    faction: FactionId,
    id: string,
    name: string,
    pos: THREE.Vector3,
    look: THREE.Vector3,
    opts: { armed?: boolean; skill?: number; speed?: number } = {},
  ): CapitalShip {
    const cap = new CapitalShip(kind, faction, id, name, pos, look);
    this.seenClasses.add(`capital-${kind}`);
    cap.speed = opts.speed ?? 0;
    this.scene.add(cap.root);
    this.world.attach(cap.world, cap.root);
    this.docking.add(cap.docks);
    for (const m of cap.mounts) {
      const t = this.spawnShip(m.heavy ? 'cannon' : 'turret', faction, m.heavy ? `${name} battery` : `${name} gun`, cap.toWorld(m.pos), cap.toWorld(m.pos.clone().add(new THREE.Vector3(0, 0, -10))), {
        turret: true,
        skill: opts.skill ?? 0.5,
        playerBias: 0.5,
      });
      if (opts.armed === false) t.ai = null;
      cap.turrets.push({ ship: t, local: m.pos.clone() });
    }
    this.capitals.push(cap);
    return cap;
  }

  /** Lets a capital ship's guns open fire (or fall silent). */
  armCapital(cap: CapitalShip, armed: boolean, skill = 0.5): void {
    for (const t of cap.turrets) {
      if (!t.ship.alive) continue;
      t.ship.ai = armed ? new TurretAI(this, skill, 0.5) : null;
      t.ship.controls.fire = false;
    }
  }

  private clearMissionExtras(): void {
    this.frameHooks = [];
    for (const o of this.decor) this.scene.remove(o);
    this.decor = [];
    this.waypoints = [];
    this.signature = null;
  }

  private clearCapitals(): void {
    for (const c of this.capitals) {
      this.scene.remove(c.root);
      this.world.detach(c.world);
    }
    this.capitals = [];
  }

  /** Spawns a ship with a jump-in flash. */
  jumpIn(classId: string, faction: FactionId, name: string, at: THREE.Vector3, lookAt: THREE.Vector3, opts: SpawnOptions = {}): Ship {
    // ships come out of a jump at full speed: never inside a rock, or pointed straight at one
    const pos = this.clearJumpSpot(at, lookAt, SHIP_CLASSES[classId].radius);
    const s = this.spawnShip(classId, faction, name, pos, lookAt, { speed: SHIP_CLASSES[classId].boostSpeed, ...opts });
    this.fx.jumpIn(pos, s.forward(_v), FACTIONS[faction].palette.engine);
    this.audio.jumpIn(pos);
    return s;
  }

  /** The nearest spot to `pos` with room around it and a clear run of 400 m towards `look`. */
  private clearJumpSpot(pos: THREE.Vector3, look: THREE.Vector3, radius: number): THREE.Vector3 {
    const n = new THREE.Vector3();
    const room = radius * 3 + 10;
    const clear = (p: THREE.Vector3): boolean => {
      if (this.world.nearestSurface(p, room, n) < room) return false;
      const dir = look.clone().sub(p);
      const len = Math.min(400, dir.length());
      return len < 1 || !this.world.raycast(p, dir.normalize(), len, radius + 4, hit);
    };
    if (clear(pos)) return pos;
    for (let k = 1; k <= 20; k++) {
      const a = k * 2.4;
      const r = 50 * k;
      const p = pos.clone().add(new THREE.Vector3(Math.cos(a) * r, ((k % 3) - 1) * r * 0.4, Math.sin(a) * r));
      if (clear(p)) return p;
    }
    return pos;
  }

  /** Ships on their way out: they fly clear and jump when their time comes. */
  private retreating: { ship: Ship; at: number }[] = [];

  /**
   * Mission API: these ships break off. They turn away from the fight, burn out at full throttle
   * and jump a few seconds later, staggered, instead of vanishing on the spot.
   */
  retreat(ships: Ship[]): void {
    ships.forEach((s, i) => {
      if (!s.alive || s.isPlayer || s.cls.anchored) return;
      const from = this.player?.pos ?? this.location.arena.center;
      const away = s.pos.clone().sub(from);
      if (away.lengthSq() < 1) away.set(rand(-1, 1), 0.3, rand(-1, 1));
      away.normalize();
      s.ai = new RoutePilot([s.pos.clone().addScaledVector(away, 4000)], 1, 100);
      s.target = null;
      this.retreating.push({ ship: s, at: this.missionTime + 4 + i * 0.7 + rand(0, 2) });
    });
  }

  /** Your target is gone: move on to the next hostile, the way a targeting computer would. */
  private autoRetarget(): void {
    const p = this.player;
    if (!p?.alive || !p.target || p.target.alive) return;
    const wasHostile = hostile(p.faction, p.target.faction);
    p.target = null;
    if (wasHostile) this.cycleTarget(true);
  }

  /** Escort drones left behind when a mission moves the player: bring them back on the wing. */
  private updateEscorts(): void {
    const p = this.player;
    if (!p?.alive) return;
    for (const d of this.ships) {
      if (!d.alive || !(d.ai instanceof AIPilot) || d.ai.wingOf !== p || d.pos.distanceToSquared(p.pos) < 3000 * 3000) continue;
      const at = p.pos.clone().add(new THREE.Vector3(d.pos.x > p.pos.x ? 25 : -25, 6, 40).applyQuaternion(p.quat));
      d.placeAt(at, at.clone().add(p.forward(new THREE.Vector3()).multiplyScalar(500)), p.speed);
    }
  }

  private updateRetreats(): void {
    if (!this.retreating.length) return;
    this.retreating = this.retreating.filter((r) => {
      if (!r.ship.alive) return false;
      if (this.missionTime < r.at) return true;
      this.jumpOut(r.ship);
      return false;
    });
  }

  /** Removes a ship with a jump flash (retreat), without counting it as a kill. */
  jumpOut(ship: Ship): void {
    if (!ship.alive) return;
    ship.alive = false;
    this.fx.jumpIn(ship.pos, ship.forward(_v).negate(), FACTIONS[ship.faction].palette.engine);
    this.audio.jumpIn(ship.pos);
    ship.dispose(this.scene);
  }

  /** Mission API: a big scripted detonation (a charge going off, a reactor letting go). Ships
   *  inside `radius` take damage that falls off with distance. */
  detonate(pos: THREE.Vector3, size = 3, radius = 0, damage = 0): void {
    const at = pos.clone();
    for (let i = 0; i < 9; i++) {
      const p = at.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(size * 14));
      window.setTimeout(() => {
        this.fx.explosion(p, size * rand(0.6, 1.2), null);
        this.audio.explosion(p, 2);
      }, i * 170);
    }
    if (this.player) this.shake += Math.max(0, size - this.player.pos.distanceTo(at) / 300);
    if (radius > 0)
      for (const s of this.ships) {
        if (!s.alive) continue;
        const d = s.pos.distanceTo(at);
        if (d < radius) this.onShipHit(s, damage * (1 - d / radius), null, s.pos.clone(), 'missile');
      }
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
    this.checkpointAt = checkpoint;
    if (checkpoint === 0) this.checkpointSaves.clear();
    this.objective = '';
    this.hintText = null;
    this.lockProgress = 0;
    this.damageFlash = 0;
    this.bounties = 0;
    this.clearCapitals();
    this.clearMissionExtras();
    this.docking.setPorts(this.location.docks);
    this.dockGuide = null;
    this.autoDock = false;
    resetRelations();
    this.missionFlags = {};
    this.bonusPay = 0;
    this.seenClasses.clear();
    this.playerDied = false;
    this.scanKey = null;
    this.scanReadout = null;
    this.retreating = [];
    this.fade(false);
    this.arena = { center: this.location.arena.center.clone(), warn: this.location.arena.warn, limit: this.location.arena.limit };
    // the battlecruiser some locations are built round counts as met
    if (this.location.frames.carrier) this.seenClasses.add('capital-battlecruiser');
    this.friendlyFire.clear();
    this.friendlyFireLimit = 220;
    this.onBetrayal = null;

    const fit = this.playerFit;
    const player = this.spawnShip(fit ? fit.cls : 'kite', 'player', 'Rook', this.location.start.pos.clone(), this.location.start.look, { speed: 40 });
    player.isPlayer = true;
    if (fit) for (const e of fit.fitted.equipment) player.equipment.add(e);
    player.flares = player.equipment.has('flares') ? 12 : 2;
    player.controls.throttle = 0.4;
    this.player = player;
    if (player.equipment.has('droneBay')) this.launchEscorts(player);
    // a retry from a checkpoint starts with what you had when you reached it
    this.bountiesCarried = 0;
    const save = checkpoint > 0 ? this.checkpointSaves.get(checkpoint) : undefined;
    if (save) {
      player.hull = Math.min(player.cls.hull, save.hull);
      player.missiles = Math.min(player.cls.missiles, save.missiles);
      player.flares = save.flares;
      player.kills = save.kills;
      this.bounties = save.bounties;
      this.bountiesCarried = save.bounties;
      this.bonusPay = save.bonusPay;
    }
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

  /** Set before the prologue starts: the player asked for the flight introduction. */
  tutorial = false;

  /** The mission area: the location's by default; escort missions move it with the escort. */
  arena = { center: new THREE.Vector3(), warn: 3000, limit: 4000 };

  /** Mission API: the mission area travels with this ship (while it lives). */
  followArena(ship: Ship, warn = 2600, limit = 3400): void {
    this.arena.warn = warn;
    this.arena.limit = limit;
    this.arena.center.copy(ship.pos);
    this.onFrame(() => {
      if (ship.alive) this.arena.center.copy(ship.pos);
    });
  }

  /** Mission API: fade the view to black (with an optional caption) or back. */
  fade(on: boolean, text = ''): void {
    document.getElementById('fade')?.classList.toggle('on', on);
    const t = document.getElementById('fade-text');
    if (t) t.textContent = text;
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

  /** Damage the player has done to each non-hostile faction this sortie. */
  private readonly friendlyFire = new Map<FactionId, number>();
  /** How much friendly fire a faction tolerates before turning on the player (missions may change it). */
  friendlyFireLimit = 220;
  /** Player damage taken and hostile pilot skill. */
  difficulty: Difficulty = 'normal';
  /** Called when a faction turns hostile because of the player's fire. */
  onBetrayal: ((faction: FactionId) => void) | null = null;

  private trackFriendlyFire(ship: Ship, damage: number): void {
    const f = ship.faction;
    if (f === 'player' || ship.invulnerable) return;
    const total = (this.friendlyFire.get(f) ?? 0) + damage;
    const before = this.friendlyFire.get(f) ?? 0;
    this.friendlyFire.set(f, total);
    if (before === 0) this.hint(`Check your fire! That is a ${FACTIONS[f].name} ship`, 3);
    if (total >= this.friendlyFireLimit && before < this.friendlyFireLimit) {
      setHostile('player', f, true);
      this.hint(`${FACTIONS[f].name} ships have turned on you!`, 4);
      this.onBetrayal?.(f);
    }
  }

  /** Mission API: forget earlier friendly fire and set a new tolerance. */
  resetFriendlyFire(limit: number): void {
    this.friendlyFire.clear();
    this.friendlyFireLimit = limit;
  }

  /** Mission API: change who is fighting whom. */
  setRelation(a: FactionId, b: FactionId, isHostile: boolean): void {
    setHostile(a, b, isHostile);
  }

  onShipHit(ship: Ship, damage: number, source: Ship | null, point: THREE.Vector3, kind: 'bolt' | 'missile'): void {
    if (source?.isPlayer && !hostile('player', ship.faction)) this.trackFriendlyFire(ship, damage);
    const hadShields = ship.shields > 0;
    if (hadShields) ship.shieldImpact(point);
    // impacts shove the hull: light ships get knocked around, the gunship barely notices
    const mass = ship.cls.anchored ? 1e9 : Math.max(1, ship.radius * ship.radius * 0.1);
    _v.subVectors(ship.pos, point).normalize();
    ship.vel.addScaledVector(_v, (kind === 'missile' ? 24 : damage * 0.35) / mass);
    ship.angVel.add(_v2.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar((kind === 'missile' ? 1.4 : 0.12) / mass));
    if (ship.isPlayer) this.camLag.addScaledVector(_v, kind === 'missile' ? 1.5 : 0.25);
    if (ship.isPlayer) damage *= DIFFICULTY[this.difficulty].damageTaken;
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
      this.playerDied = true;
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
    if (p.held && !this.docking.active) {
      // parked on a deck: free look around, nothing else
      const d = this.input.takeAimDelta();
      this.aimQuat.premultiply(_q.setFromAxisAngle(AXIS_Y, -d.x));
      this.aimQuat.multiply(_q.setFromAxisAngle(AXIS_X, -d.y));
      if (!this.input.mouseAimActive) {
        this.aimQuat.premultiply(_q.setFromAxisAngle(AXIS_Y, -f.yaw * dt * 1.5));
        this.aimQuat.multiply(_q.setFromAxisAngle(AXIS_X, f.pitch * dt * 1.5));
      }
      this.aimQuat.normalize();
      return;
    }
    if (p.held || (this.autoDock && this.docking.active)) {
      // the clamps or the docking computer have the ship; keep the view behind the nose
      this.input.takeAimDelta();
      this.aimQuat.slerp(p.quat, dampFactor(4, dt));
      if (this.input.pressed('dock')) this.requestDock();
      return;
    }
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
    // throttle runs down into reverse (a quarter of top speed); it pauses at a full stop so a
    // held key does not back you up by accident
    const next = clamp(c.throttle + f.throttleDelta * dt * 0.8, REVERSE_THROTTLE, 1);
    if (f.throttleDelta >= 0) this.stopDetent = false;
    if (c.throttle > 0 && next <= 0 && f.throttleDelta < 0) {
      c.throttle = 0;
      this.stopDetent = true;
    } else if (!(this.stopDetent && next < 0)) c.throttle = next;
    const cap = Docking.approachThrottle(this.dockGuide, p);
    if (cap !== null && f.throttleDelta <= 0) c.throttle = Math.min(c.throttle, cap);
    if (this.input.pressed('matchSpeed')) {
      // with the scanner open it matches the scanned contact, otherwise the combat target
      const scanned = this.scannedContact();
      const speed = scanned?.ship ? scanned.ship.speed : scanned?.capital ? scanned.capital.speed : p.target?.speed;
      if (speed !== undefined) {
        c.throttle = clamp(speed / p.cls.maxSpeed, 0, 1);
        this.hint(`Matching speed: ${Math.round(speed)} m/s`, 1.5);
      }
    }
    if (this.input.pressed('scanTarget')) {
      const scanned = this.scannedContact();
      if (scanned?.ship && scanned.ship.alive) {
        p.target = scanned.ship;
        this.lockProgress = 0;
        this.audio.blip(1100, 0.08, 0.05);
      } else this.hint(scanned ? 'Only ships can be targeted' : `Scan a ship first (${this.input.label('scan')})`, 2);
    }
    if (this.input.pressed('flares')) this.dropFlare(p);
    if (this.input.pressed('dock')) this.requestDock();
    if (this.input.pressed('scan')) this.cycleScan();
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
    // ships you cannot hurt right now (shielded, or out of the fight) are left out
    const enemies = this.ships.filter((s) => s.alive && s !== p && !s.invulnerable && (!s.cls.civilian || s.cls.targetable) && hostile(p.faction, s.faction));
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
    const mounts = ship.cls.mounts;
    if (mounts && mounts.length) {
      // player fits: every gun slot cycles on its own, from its own hardpoint
      let sound = true;
      for (let i = 0; i < mounts.length; i++) {
        if ((ship.mountTimers[i] ?? 0) > 0) continue;
        if (this.fireBolt(ship, mounts[i], gunHardpoint(ship.model.guns, i), sound)) {
          ship.mountTimers[i] = mounts[i].cooldown * POWER[ship.power].gunRate;
          sound = false;
        }
      }
      return;
    }
    if (ship.gunTimer > 0) return;
    const hp = ship.model.guns[ship.gunSide % ship.model.guns.length];
    if (this.fireBolt(ship, ship.cls.gun, hp, true)) {
      ship.gunSide++;
      ship.gunTimer = ship.cls.gun.cooldown * POWER[ship.power].gunRate;
    }
  }

  /** One shot (or one scatter blast) from a hardpoint. Returns false if it could not fire. */
  private fireBolt(ship: Ship, gun: GunSpec, gunLocal: THREE.Vector3, sound: boolean): boolean {
    const pw = POWER[ship.power];
    const cost = gun.energyCost * pw.gunCost;
    if (ship.energy < cost || gun.damage <= 0) return false;
    ship.forward(_v);
    const origin = ship.toWorld(gunLocal, _v2).clone();
    const dir = _v3;
    const t = ship.target;
    if (gun.turretArc !== undefined) {
      if (!t || !t.alive) return false;
      _n.subVectors(t.pos, origin);
      const ti = interceptTime(_n, _relVel.subVectors(t.vel, ship.vel), gun.boltSpeed);
      dir.copy(t.pos).addScaledVector(t.vel, Math.max(ti, 0)).sub(origin).normalize();
      if (dir.angleTo(_v) > gun.turretArc) return false;
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
    if (sound) {
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
    return true;
  }

  /** Lock time of the quickest guided launcher, or 0 when nothing fitted needs a lock. */
  private lockTimeFor(ship: Ship): number {
    const launchers = ship.cls.launchers;
    if (launchers) {
      const guided = launchers.filter((l) => l.lockTime > 0).map((l) => l.lockTime);
      return guided.length ? Math.min(...guided) : 0;
    }
    return (ship.cls.missile ?? DEFAULT_MISSILE).lockTime;
  }

  private fireMissile(ship: Ship): void {
    if (ship.cls.launchers) {
      this.fireLauncher(ship, ship.cls.launchers);
      return;
    }
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

  /**
   * Player launchers take turns: the missile key fires the next launcher that can fire right
   * now (unguided ones always can; guided ones need the lock). All share one magazine.
   */
  private fireLauncher(ship: Ship, launchers: MissileSpec[]): void {
    if (ship.missileTimer > 0) return;
    const target = ship.target && ship.target.alive ? ship.target : null;
    for (let k = 0; k < launchers.length; k++) {
      const i = (ship.launcherIndex + k) % launchers.length;
      const spec = launchers[i];
      const cost = spec.cost ?? 1;
      if (ship.missiles < cost - 1e-6) continue;
      if (spec.lockTime > 0 && (!target || this.lockProgress < 1)) continue;
      ship.missiles -= cost;
      ship.missileTimer = spec.refire;
      ship.launcherIndex = i + 1;
      for (let n = 0; n < spec.salvo; n++) this.missiles.launch(ship, spec.lockTime > 0 ? target : null, this, spec, n, spec.salvo);
      return;
    }
    this.audio.blip(300, 0.1, 0.1);
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
    const ma = a.cls.anchored ? 1e9 : a.radius * a.radius;
    const mb = b.cls.anchored ? 1e9 : b.radius * b.radius;
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
      if (s.held) continue;
      if (s.ai) s.ai.update(s, dt);
      if (s.cls.anchored) {
        // fixed installations aim (their AI turns them) but never move
        const q = s.quat.clone();
        s.updateFlight(dt);
        s.quat.copy(q);
        s.vel.set(0, 0, 0);
        s.angVel.set(0, 0, 0);
      } else {
        s.updateFlight(dt);
        this.moveShip(s, dt);
      }
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

  private updateDocking(dt: number): void {
    const p = this.player;
    if (!p || !p.alive || !this.docking.active) {
      this.dockGuide = null;
      return;
    }
    // the autopilot test hook requests clearance itself once docking opens
    this.dockGuide = this.docking.update(p, dt);
    const g = this.dockGuide;
    p.held = !!g && (g.stage === 'landing' || g.stage === 'docked');
    if (g && !p.held && this.autoDock) this.dockPilot.fly(p, g, dt);
    if (p.held) p.syncTransform();
  }

  private updatePlayerSystems(dt: number): void {
    const p = this.player;
    if (!p || !p.alive) {
      this.audio.setLock('none');
      this.audio.setMissileWarning(0);
      return;
    }
    // lead & lock
    this.autoRetarget();
    // built-in flares: two charges that come back slowly; a dispenser adds ten more
    if (p.flares < 2) {
      p.flareCharge += dt;
      if (p.flareCharge >= FLARE_RECHARGE) {
        p.flareCharge = 0;
        p.flares++;
      }
    } else p.flareCharge = 0;
    this.hasLead = false;
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
      const lockTime = this.lockTimeFor(p);
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
    const r = p.pos.distanceTo(this.arena.center);
    if (r > this.arena.limit) {
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
      const o = this.location.orbit;
      const r = o.radius;
      this.camera.position.set(Math.cos(this.titleAngle) * r, o.height + Math.sin(this.titleAngle * 0.7) * 120, Math.sin(this.titleAngle) * r).add(o.center);
      this.camera.lookAt(o.center);
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
        if (mouseAim || (p.held && !this.docking.active)) this.camQuat.copy(this.aimQuat);
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
    if (!this.beaconMesh) return;
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
    this.autopilot = true;
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
      if (this.autopilot && this.player?.alive) {
        // test autopilot: take docking clearance when it opens and let the docking computer fly
        if (this.docking.allowed && !this.docking.active) this.requestDock();
        if (this.docking.active) {
          this.autoDock = true;
          this.player.ai = null;
        }
      }
      if (this.capitals.length) {
        for (const c of this.capitals) c.update(dt);
        this.world.sync();
      }
      const steps = Math.ceil(dt / (1 / 90));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) this.step(h);
      for (const hook of this.frameHooks) hook(dt);
      this.updateDocking(dt);
      this.updatePlayerSystems(dt);
      this.updateScan();
      this.updateRetreats();
      this.updateEscorts();
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
        boundary: p.pos.distanceTo(this.arena.center) > this.arena.warn,
        damageFlash: this.damageFlash,
        time: this.time,
        gamepad: this.input.device === 'gamepad',
        dock: this.dockGuide,
        docks: this.docking.openPorts(),
        signature: this.signature,
        waypoints: this.waypoints,
        scan: this.scanReadout,
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
    this.fade(false);
    this.missionToken++;
    for (const w of this.waiters) w.reject(new MissionAbort());
    this.waiters = [];
    this.comms.clear();
    for (const s of this.ships) s.dispose(this.scene);
    this.ships = [];
    this.player = null;
    this.bolts.clear();
    this.missiles.clear();
    this.clearCapitals();
    this.clearMissionExtras();
    this.docking.setPorts(this.location.docks);
    this.dockGuide = null;
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
