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

interface Fireball {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  life: number;
  maxLife: number;
  size: number;
}

interface Debris {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  axis: THREE.Vector3;
  spin: number;
  angle: number;
  scale: THREE.Vector3;
  life: number;
  trail: number;
}

const NOISE = /* glsl */ `
  float fh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float fn(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fh(i), fh(i + vec3(1,0,0)), f.x), mix(fh(i + vec3(0,1,0)), fh(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(fh(i + vec3(0,0,1)), fh(i + vec3(1,0,1)), f.x), mix(fh(i + vec3(0,1,1)), fh(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float ffbm(vec3 p) { return fn(p) * 0.55 + fn(p * 2.1) * 0.3 + fn(p * 4.3) * 0.15; }
`;

/** Billowing fireball: noise-displaced sphere whose heat ramps from white core to dark smoke. */
const fireballMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLife: { value: 0 }, uSeed: { value: 0 }, uTint: { value: new THREE.Color('#ff8a2a') } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSeed;
      uniform float uLife;
      varying float vHeat;
      varying vec3 vNorm;
      varying vec3 vView;
      ${NOISE}
      void main() {
        float n = ffbm(normal * 2.2 + uSeed + uTime * 1.3);
        vHeat = n;
        vec3 p = position * (1.0 + (n - 0.4) * (0.6 + uLife * 0.5));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vNorm = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uLife;
      uniform vec3 uTint;
      varying float vHeat;
      varying vec3 vNorm;
      varying vec3 vView;
      void main() {
        float heat = clamp(vHeat * 1.5 - uLife * 1.2 + 0.3, 0.0, 1.0);
        vec3 col = mix(vec3(0.08, 0.03, 0.06), uTint * 1.5, smoothstep(0.08, 0.45, heat));
        col = mix(col, vec3(2.2, 1.7, 1.1), smoothstep(0.62, 0.95, heat));
        float facing = abs(dot(vNorm, vView));
        float alpha = (1.0 - smoothstep(0.5, 1.0, uLife)) * mix(0.25, 0.85, facing);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

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
  private readonly fireballs: Fireball[] = [];
  private fireballIndex = 0;
  private readonly debris: Debris[] = [];
  private readonly debrisMesh: THREE.InstancedMesh;
  private readonly maxDebris = 180;
  private time = 0;

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
    const fbGeo = new THREE.IcosahedronGeometry(1, 4);
    for (let i = 0; i < 10; i++) {
      const material = fireballMaterial();
      const mesh = new THREE.Mesh(fbGeo, material);
      mesh.visible = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      this.fireballs.push({ mesh, material, life: 0, maxLife: 1, size: 1 });
    }
    this.debrisMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: '#4a4652',
        roughness: 0.55,
        metalness: 0.6,
        emissive: '#ff5a18',
        emissiveIntensity: 0.9,
      }),
      this.maxDebris,
    );
    this.debrisMesh.count = 0;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.castShadow = true;
    scene.add(this.debrisMesh);
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

  fireball(p: THREE.Vector3, size: number, life: number, tint: THREE.ColorRepresentation): void {
    const f = this.fireballs[this.fireballIndex++ % this.fireballs.length];
    f.mesh.position.copy(p);
    f.mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    f.material.uniforms.uSeed.value = rand(0, 50);
    (f.material.uniforms.uTint.value as THREE.Color).set(tint);
    f.life = life;
    f.maxLife = life;
    f.size = size;
    f.mesh.visible = true;
  }

  /** Tumbling, glowing hull fragments that trail fire and smoke. */
  spawnDebris(p: THREE.Vector3, count: number, speed: number, inheritVel: THREE.Vector3 | null, size: number): void {
    for (let i = 0; i < count; i++) {
      if (this.debris.length >= this.maxDebris) this.debris.shift();
      const vel = randomUnitVector(new THREE.Vector3()).multiplyScalar(rand(0.3, 1) * speed);
      if (inheritVel) vel.addScaledVector(inheritVel, 0.4);
      this.debris.push({
        pos: p.clone(),
        vel,
        axis: randomUnitVector(new THREE.Vector3()),
        spin: rand(2, 9),
        angle: 0,
        scale: new THREE.Vector3(rand(0.4, 1.4), rand(0.2, 0.7), rand(0.6, 2)).multiplyScalar(size),
        life: rand(1.8, 3.5),
        trail: 0,
      });
    }
  }

  explosion(p: THREE.Vector3, scale: number, inheritVel: THREE.Vector3 | null, tint = '#ff8a2a'): void {
    this.fireball(p, 9 * scale, 1.1 + scale * 0.25, tint);
    if (scale >= 1) {
      this.fireball(_v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(4 * scale).add(p), 6 * scale, 0.9, '#ff6a2a');
      this.spawnDebris(p, Math.round(8 * scale), 45 + 15 * scale, inheritVel, Math.min(scale, 2.2));
    }
    const base = inheritVel ? _v2.copy(inheritVel).multiplyScalar(0.3) : _v2.set(0, 0, 0);
    // core flash
    this.particles.emit(p, base, {
      life: 0.18,
      size0: 16 * scale,
      size1: 26 * scale,
      color0: _c0.set('#ffffff').multiplyScalar(1.6),
      color1: _c1.set(tint),
    });
    // flame licks thrown out of the fireball mesh
    for (let i = 0; i < 12 * scale; i++) {
      randomUnitVector(_v).multiplyScalar(rand(15, 45) * scale).add(base);
      this.particles.emit(p, _v, {
        life: rand(0.4, 0.9),
        size0: rand(3, 6) * scale,
        size1: rand(6, 10) * scale,
        color0: _c0.set('#ffc060').multiplyScalar(1.3),
        color1: _c1.set(tint).multiplyScalar(0.2),
        drag: 2,
        alpha: 0.7,
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
    this.flash(p, tint, 260 * scale, 0.5);
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

  trail(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, size: number, life: number, alpha = 1): void {
    this.particles.emit(p, v, {
      life,
      size0: size,
      size1: size * 0.2,
      color0: color,
      color1: _c1.copy(color).multiplyScalar(0.15),
      drag: 0.5,
      alpha,
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

  private updateFireballsAndDebris(dt: number): void {
    this.time += dt;
    for (const f of this.fireballs) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const t = 1 - Math.max(f.life, 0) / f.maxLife;
      const s = f.size * (0.35 + 0.65 * (1 - Math.pow(1 - t, 3)));
      f.mesh.scale.set(s, s, s);
      f.material.uniforms.uLife.value = t;
      f.material.uniforms.uTime.value = this.time;
      if (f.life <= 0) f.mesh.visible = false;
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let n = 0;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.debris.splice(i, 1);
        continue;
      }
      d.vel.multiplyScalar(Math.exp(-0.25 * dt));
      d.pos.addScaledVector(d.vel, dt);
      d.angle += d.spin * dt;
      d.trail -= dt;
      if (d.trail <= 0) {
        d.trail = 0.035;
        const hot = Math.min(1, d.life / 2);
        this.particles.emit(d.pos, _v.set(0, 0, 0), {
          life: rand(0.5, 1.0),
          size0: 1.5 + d.scale.x,
          size1: 4 + d.scale.x * 2,
          color0: _c0.set('#ff9a40').multiplyScalar(1.5 * hot + 0.2),
          color1: _c1.set('#1a1020'),
          drag: 1,
          alpha: 0.7,
        });
      }
      q.setFromAxisAngle(d.axis, d.angle);
      this.debrisMesh.setMatrixAt(n++, m.compose(d.pos, q, d.scale));
    }
    this.debrisMesh.count = n;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    this.updateFireballsAndDebris(dt);
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
