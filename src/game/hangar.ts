import * as THREE from 'three';
import { SeededRandom, clamp, dampFactor } from '../core/math';
import { StructureBuilder, v3 } from '../world/builder';
import { FACTIONS, shipPalette } from '../entities/factions';
import { getShipModel } from '../entities/models';
import type { ShipClass } from '../entities/shipClasses';

/**
 * The hangar between missions: a lit bay inside the station with the selected ship hovering on
 * a turntable and the bay doors open to space behind it. It has its own scene and camera; the
 * game swaps them into the render pipeline (the sky pass still draws the stars through the
 * door).
 */
export class Hangar {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.3, 4000);
  private readonly turntable = new THREE.Group();
  private display: THREE.Group | null = null;
  private displayKey = '';
  private readonly spot: THREE.SpotLight;
  private readonly field: THREE.Mesh;
  private time = 0;
  private yaw = 0.75;
  private pitch = 0.2;
  private dist = 32;
  private targetDist = 32;
  private spin = 0;
  private dragging = false;
  private lastInteract = -10;

  constructor(environment: THREE.Texture | null) {
    this.scene.environment = environment;
    this.scene.environmentIntensity = 0.35;
    this.buildBay();

    this.scene.add(new THREE.HemisphereLight('#8fa6d8', '#2a1c2e', 0.7));
    this.spot = new THREE.SpotLight('#fff3e0', 5200, 0, 0.55, 0.65, 2);
    this.spot.position.set(0, 32, 4);
    this.spot.target.position.set(0, 0, 0);
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.bias = -0.0004;
    this.scene.add(this.spot, this.spot.target);
    const teal = new THREE.PointLight('#38f0d0', 520, 60, 2);
    teal.position.set(-16, 5, -8);
    const amber = new THREE.PointLight('#ff9a3c', 380, 60, 2);
    amber.position.set(16, 3, -10);
    const space = new THREE.DirectionalLight('#9cb8ff', 0.9);
    space.position.set(0.3, 0.4, -1);
    this.scene.add(teal, amber, space);

    // faint volumetric cone under the spotlight
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(10.5, 32, 32, 1, true).translate(0, -16, 0),
      new THREE.MeshBasicMaterial({
        color: '#fff0d8',
        transparent: true,
        opacity: 0.045,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    cone.position.set(0, 30, 3.5);
    this.scene.add(cone);

    // shimmering atmosphere field across the open bay door
    this.field = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 30),
      new THREE.MeshBasicMaterial({
        color: '#4fb8ff',
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.field.position.set(0, 12, -60);
    this.scene.add(this.field);

    this.turntable.position.set(0, 0, 0);
    this.scene.add(this.turntable);
    this.parkedShips();
  }

  private buildBay(): void {
    const floor = new StructureBuilder();
    floor.box(v3(0, -3.5, 0), v3(140, 1, 120), '#3b4152', { collide: false });
    // pad and turntable
    floor.cylinder(v3(0, -2.5, 0), 10, 1, '#262a36', { collide: false, sides: 48 });
    floor.cylinder(v3(0, -1.95, 0), 7.5, 0.12, '#323849', { collide: false, sides: 48 });
    // side pads for parked ships
    for (const x of [-40, 40]) floor.cylinder(v3(x, -2.8, -14), 8, 0.4, '#2c3040', { collide: false, sides: 32 });
    this.scene.add(floor.build('hangar-floor', 'ship'));

    const b = new StructureBuilder();
    const wallCol = '#4a5266';
    const ribCol = '#2c3142';
    // side walls, back wall and ceiling
    for (const s of [-1, 1]) b.box(v3(s * 70, 17, 0), v3(2, 42, 120), wallCol, { collide: false });
    b.box(v3(0, 17, 60), v3(140, 42, 2), wallCol, { collide: false });
    b.box(v3(0, 38, 0), v3(140, 2, 120), wallCol, { collide: false });
    // front wall with the bay opening (70 x 30)
    for (const s of [-1, 1]) b.box(v3(s * 52.5, 17, -60), v3(35, 42, 2), wallCol, { collide: false });
    b.box(v3(0, 32.5, -60), v3(70, 11, 2), wallCol, { collide: false });
    // ribs and ceiling beams
    for (let z = -45; z <= 45; z += 15) {
      for (const s of [-1, 1]) b.box(v3(s * 67.5, 17, z), v3(3, 42, 2.4), ribCol, { collide: false });
      b.box(v3(0, 35.6, z), v3(136, 2.8, 2.2), ribCol, { collide: false });
    }
    // door frame
    for (const s of [-1, 1]) b.box(v3(s * 36, 12, -59), v3(2.4, 30, 3), '#20232e', { collide: false });
    b.box(v3(0, 27.2, -59), v3(74, 2.4, 3), '#20232e', { collide: false });
    // crane gantry over the pad
    for (const z of [-6, 6]) b.box(v3(0, 30, z), v3(136, 1.6, 1.4), '#3a3f50', { collide: false });
    b.box(v3(0, 28.6, 0), v3(5, 1.6, 13), '#ffb347', { collide: false });
    // crates and fuel tanks along the walls
    const rng = new SeededRandom(7);
    const crateColors = ['#ff4d4d', '#ffcf33', '#2fb7ff', '#3ee07a', '#ff7ad9', '#9b6bff', '#ff8a1f'];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const z = 10 + i * 5.2 + rng.range(-0.6, 0.6);
        const stack = rng.int(1, 3);
        for (let k = 0; k < stack; k++) {
          const size = rng.range(3.2, 4.2);
          b.box(v3(s * rng.range(58, 63), -3 + size / 2 + k * size, z), v3(size, size, size), crateColors[rng.int(0, crateColors.length - 1)], {
            collide: false,
          });
        }
      }
      for (let i = 0; i < 3; i++) b.cylinder(v3(s * 61, 4, -48 + i * 8), 3, 14, '#d8dde8', { collide: false, sides: 16 });
    }
    this.scene.add(b.build('hangar-bay', 'structure'));

    // emissive details: light strips, floor guide lines, hazard stripes, beacons
    const g = new StructureBuilder();
    for (let z = -45; z <= 45; z += 15) {
      for (const s of [-1, 1]) g.box(v3(s * 65.8, 17, z), v3(0.25, 34, 0.5), '#bfe8ff', { collide: false, glow: 1.1 });
      g.box(v3(0, 34.1, z), v3(120, 0.2, 0.4), '#bfe8ff', { collide: false, glow: 1.3 });
    }
    g.torus(v3(0, -1.98, 0), 10.05, 0.12, '#38f0d0', { quat: new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2), glow: 2.2, tubular: 96 });
    g.torus(v3(0, -1.86, 0), 7.5, 0.06, '#38f0d0', { quat: new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2), glow: 1.2, tubular: 96 });
    for (const x of [-40, 40]) {
      g.torus(v3(x, -2.58, -14), 8.05, 0.1, '#ffcf33', { quat: new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2), glow: 1.6, tubular: 64 });
    }
    for (const sx of [-4.5, 4.5]) {
      for (let z = -56; z < -12; z += 4) g.box(v3(sx, -2.96, z), v3(0.5, 0.05, 2.2), '#ffb347', { collide: false, glow: 1.6 });
    }
    for (let y = -2; y < 26; y += 3) {
      for (const s of [-1, 1]) g.box(v3(s * 34.6, y, -57.4), v3(0.3, 1.5, 0.2), '#ffcf33', { collide: false, glow: 1.4 });
    }
    for (const s of [-1, 1]) g.sphere(v3(s * 36, 28, -57), 0.6, '#ff3030', { collide: false, glow: 3, detail: 0 });
    this.scene.add(g.build('hangar-lights'));
  }

  /** A couple of militia fighters parked on the side pads, for scale and company. */
  private parkedShips(): void {
    for (const [x, rot] of [
      [-40, 0.6],
      [40, -0.5],
    ] as const) {
      const m = getShipModel('warden', FACTIONS.kestrel.palette, 'kestrel');
      m.group.position.set(x, -0.6, -14);
      m.group.rotation.y = rot;
      this.scene.add(m.group);
    }
  }

  /** Shows a ship on the turntable (rebuilt only when the hull changes). Hulls you own wear your
   *  paint; ones you are browsing wear their yard's. */
  showShip(cls: ShipClass, owned = true): void {
    const maker = cls.maker ?? 'kestrel';
    const paint = owned || maker === 'kestrel' ? shipPalette('player', maker) : shipPalette(maker);
    const key = `${cls.model}:${paint.key}`;
    if (key === this.displayKey) return;
    if (this.display) this.turntable.remove(this.display);
    const m = getShipModel(cls.model, paint.palette, paint.key);
    this.display = m.group;
    this.displayKey = key;
    this.turntable.add(m.group);
    this.targetDist = cls.radius * 7.5 + 8;
  }

  setShadows(on: boolean): void {
    this.spot.castShadow = on;
  }

  // --- camera orbit (drag to rotate, wheel to zoom) -------------------------------------------

  attachControls(el: HTMLElement, active: () => boolean): void {
    let lastX = 0;
    let lastY = 0;
    el.addEventListener('pointerdown', (e) => {
      if (!active()) return;
      this.dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener('pointerup', () => (this.dragging = false));
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging || !active()) return;
      this.yaw -= (e.clientX - lastX) * 0.006;
      this.pitch = clamp(this.pitch + (e.clientY - lastY) * 0.004, -0.05, 0.9);
      lastX = e.clientX;
      lastY = e.clientY;
      this.lastInteract = this.time;
    });
    el.addEventListener(
      'wheel',
      (e) => {
        if (!active()) return;
        this.targetDist = clamp(this.targetDist * (1 + Math.sign(e.deltaY) * 0.08), 12, 60);
        this.lastInteract = this.time;
      },
      { passive: true },
    );
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.time += dt;
    // idle: the ship turns slowly on the turntable and the camera drifts
    if (!this.dragging && this.time - this.lastInteract > 4) this.yaw += dt * 0.06;
    this.spin += dt * 0.18;
    if (this.display) {
      this.display.position.y = 1.2 + Math.sin(this.time * 1.1) * 0.25;
      this.display.rotation.set(Math.sin(this.time * 0.7) * 0.03, this.spin, Math.sin(this.time * 0.9) * 0.04);
    }
    this.dist += (this.targetDist - this.dist) * dampFactor(4, dt);
    // keep the ship right of centre so the shop panel on the left does not cover it
    const look = v3(0, 1, 0);
    const cp = Math.cos(this.pitch);
    this.camera.position.set(Math.sin(this.yaw) * cp * this.dist, Math.sin(this.pitch) * this.dist + 1.5, Math.cos(this.yaw) * cp * this.dist);
    this.camera.lookAt(look);
    const right = v3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.camera.position.addScaledVector(right, -this.dist * 0.05);
    (this.field.material as THREE.MeshBasicMaterial).opacity = 0.04 + Math.sin(this.time * 2.3) * 0.012;
  }
}
