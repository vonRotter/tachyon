import * as THREE from 'three';
import { ParticleSystem } from './particles';
import { rand, randomUnitVector } from '../core/math';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c0 = new THREE.Color();
const _c1 = new THREE.Color();

interface Ring {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  size: number;
}

interface Flash {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  intensity: number;
}

/** Explosions, sparks, trails and flashes. A fixed light pool avoids shader recompiles. */
export class Effects {
  readonly particles = new ParticleSystem(9000);
  private readonly rings: Ring[] = [];
  private readonly flashes: Flash[] = [];
  private ringIndex = 0;
  private flashIndex = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.particles.points);
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    for (let i = 0; i < 10; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(ringGeo, material);
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, material, life: 0, maxLife: 1, size: 1 });
    }
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight('#ffaa55', 0, 400, 1.6);
      scene.add(light);
      this.flashes.push({ light, life: 0, maxLife: 1, intensity: 0 });
    }
  }

  flash(p: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number, duration: number): void {
    const f = this.flashes[this.flashIndex++ % this.flashes.length];
    f.light.position.copy(p);
    f.light.color.set(color);
    f.intensity = intensity;
    f.life = duration;
    f.maxLife = duration;
  }

  ring(p: THREE.Vector3, normal: THREE.Vector3 | null, color: THREE.ColorRepresentation, size: number, life: number): void {
    const r = this.rings[this.ringIndex++ % this.rings.length];
    r.mesh.position.copy(p);
    if (normal) r.mesh.lookAt(_v.copy(p).add(normal));
    else r.mesh.quaternion.setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), 0));
    r.material.color.set(color).multiplyScalar(2);
    r.life = life;
    r.maxLife = life;
    r.size = size;
    r.mesh.visible = true;
  }

  explosion(p: THREE.Vector3, scale: number, inheritVel: THREE.Vector3 | null, tint = '#ff8a2a'): void {
    const base = inheritVel ? _v2.copy(inheritVel).multiplyScalar(0.3) : _v2.set(0, 0, 0);
    // core flash
    this.particles.emit(p, base, {
      life: 0.25,
      size0: 40 * scale,
      size1: 60 * scale,
      color0: _c0.set('#ffffff').multiplyScalar(3),
      color1: _c1.set(tint),
    });
    // fireball
    for (let i = 0; i < 40 * scale; i++) {
      randomUnitVector(_v).multiplyScalar(rand(5, 35) * scale).add(base);
      this.particles.emit(p, _v, {
        life: rand(0.5, 1.3),
        size0: rand(8, 18) * scale,
        size1: rand(18, 30) * scale,
        color0: _c0.set('#ffd27a').multiplyScalar(2.2),
        color1: _c1.set(tint).multiplyScalar(0.25),
        drag: 1.8,
      });
    }
    // sparks
    for (let i = 0; i < 50 * scale; i++) {
      randomUnitVector(_v).multiplyScalar(rand(60, 180) * Math.sqrt(scale)).add(base);
      this.particles.emit(p, _v, {
        life: rand(0.4, 1.2),
        size0: rand(1.2, 2.4),
        size1: 0.2,
        color0: _c0.set('#fff2b0').multiplyScalar(3),
        color1: _c1.set('#ff4a1a'),
        drag: 1.2,
      });
    }
    // lingering smoke tinted by the nebula
    for (let i = 0; i < 12 * scale; i++) {
      randomUnitVector(_v).multiplyScalar(rand(4, 16) * scale).add(base);
      this.particles.emit(p, _v, {
        life: rand(1.5, 3),
        size0: 10 * scale,
        size1: 34 * scale,
        color0: _c0.set('#5a3a6a'),
        color1: _c1.set('#120a1a'),
        drag: 0.8,
        alpha: 0.5,
      });
    }
    this.ring(p, null, tint, 70 * scale, 0.7);
    this.flash(p, tint, 900 * scale, 0.6);
  }

  sparks(p: THREE.Vector3, normal: THREE.Vector3, color: THREE.ColorRepresentation, count: number, speed = 80): void {
    for (let i = 0; i < count; i++) {
      randomUnitVector(_v).add(normal).normalize().multiplyScalar(rand(0.3, 1) * speed);
      this.particles.emit(p, _v, {
        life: rand(0.2, 0.6),
        size0: rand(0.8, 1.8),
        size1: 0.1,
        color0: _c0.set(color).multiplyScalar(3),
        color1: _c1.set('#ff3a10'),
        drag: 2,
      });
    }
  }

  impact(p: THREE.Vector3, normal: THREE.Vector3, color: THREE.ColorRepresentation): void {
    const hex = new THREE.Color(color).getHex();
    this.particles.emit(p, _v.set(0, 0, 0), {
      life: 0.18,
      size0: 9,
      size1: 3,
      color0: _c0.set(hex).multiplyScalar(3),
      color1: _c1.set(hex),
    });
    this.sparks(p, normal, hex, 6, 60);
  }

  trail(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, size: number, life: number): void {
    this.particles.emit(p, v, {
      life,
      size0: size,
      size1: size * 0.2,
      color0: color,
      color1: _c1.copy(color).multiplyScalar(0.15),
      drag: 0.5,
    });
  }

  smoke(p: THREE.Vector3, v: THREE.Vector3): void {
    this.particles.emit(p, v, {
      life: rand(0.8, 1.6),
      size0: 2,
      size1: 9,
      color0: _c0.set('#ff7a30').multiplyScalar(0.8),
      color1: _c1.set('#1a1020'),
      drag: 0.6,
      alpha: 0.7,
    });
  }

  /** Bright streak and ring when a ship drops out of jump. */
  jumpIn(p: THREE.Vector3, dir: THREE.Vector3, color: THREE.ColorRepresentation): void {
    for (let i = 0; i < 30; i++) {
      _v.copy(dir).multiplyScalar(rand(-400, -80));
      this.particles.emit(_v2.copy(p).addScaledVector(dir, rand(-30, 0)), _v, {
        life: rand(0.3, 0.7),
        size0: rand(4, 10),
        size1: 0.5,
        color0: _c0.set(color).multiplyScalar(3),
        color1: _c1.set('#ffffff'),
      });
    }
    this.ring(p, dir, color, 40, 0.6);
    this.flash(p, color, 600, 0.4);
  }

  update(dt: number): void {
    this.particles.update(dt);
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - Math.max(r.life, 0) / r.maxLife;
      const s = r.size * (0.15 + t * 0.85);
      r.mesh.scale.set(s, s, s);
      r.material.opacity = (1 - t) * 0.9;
      if (r.life <= 0) r.mesh.visible = false;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) {
        f.light.intensity = 0;
        continue;
      }
      f.life -= dt;
      const t = Math.max(f.life, 0) / f.maxLife;
      f.light.intensity = f.intensity * t * t;
    }
  }
}
