import * as THREE from 'three';
import { clamp } from '../core/math';
import { FACTIONS, hostile } from '../entities/factions';
import type { Ship } from '../entities/ship';

export interface HudData {
  player: Ship;
  camera: THREE.PerspectiveCamera;
  ships: Ship[];
  lead: THREE.Vector3 | null;
  lockProgress: number;
  locked: boolean;
  incoming: THREE.Vector3[];
  cursor: { x: number; y: number } | null;
  objective: string;
  hint: string | null;
  boundary: boolean;
  damageFlash: number;
  time: number;
  gamepad: boolean;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _inv = new THREE.Quaternion();

const FONT = '"Rajdhani", "Segoe UI", system-ui, sans-serif';

/** Canvas-drawn flight HUD. Everything is redrawn each frame; it is cheap at this size. */
export class Hud {
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  clear(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  /** World to screen. Returns null when behind the camera. */
  private project(p: THREE.Vector3, camera: THREE.Camera): { x: number; y: number } | null {
    _v.copy(p).project(camera);
    if (_v.z > 1) return null;
    return { x: (_v.x * 0.5 + 0.5) * this.w, y: (-_v.y * 0.5 + 0.5) * this.h };
  }

  /** Edge-of-screen arrow position and angle for something off screen. */
  private edge(p: THREE.Vector3, camera: THREE.Camera): { x: number; y: number; a: number } {
    _inv.copy(camera.quaternion).invert();
    _v2.copy(p).sub(camera.position).applyQuaternion(_inv);
    const a = Math.atan2(-_v2.y, _v2.x);
    const cx = this.w / 2;
    const cy = this.h / 2;
    const rx = this.w / 2 - 40;
    const ry = this.h / 2 - 40;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const k = Math.min(rx / Math.abs(c || 1e-6), ry / Math.abs(s || 1e-6));
    return { x: cx + c * k, y: cy + s * k, a };
  }

  draw(d: HudData): void {
    const g = this.ctx;
    this.clear();
    const p = d.player;
    const cam = d.camera;
    const hudColor = FACTIONS.player.hudColor;
    g.lineWidth = 1.5;
    g.font = `600 13px ${FONT}`;
    g.textBaseline = 'middle';

    // damage vignette
    if (d.damageFlash > 0.01) {
      const grad = g.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.25, this.w / 2, this.h / 2, this.h * 0.8);
      grad.addColorStop(0, 'rgba(255,40,60,0)');
      grad.addColorStop(1, `rgba(255,40,60,${0.45 * d.damageFlash})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, this.w, this.h);
    }

    // crosshair at gun convergence
    const conv = p.forward(new THREE.Vector3()).multiplyScalar(450).add(p.pos);
    const ch = this.project(conv, cam);
    if (ch) {
      g.strokeStyle = hudColor;
      g.beginPath();
      g.arc(ch.x, ch.y, 14, 0, Math.PI * 2);
      g.moveTo(ch.x - 24, ch.y);
      g.lineTo(ch.x - 8, ch.y);
      g.moveTo(ch.x + 8, ch.y);
      g.lineTo(ch.x + 24, ch.y);
      g.moveTo(ch.x, ch.y + 8);
      g.lineTo(ch.x, ch.y + 18);
      g.stroke();
      g.fillStyle = hudColor;
      g.fillRect(ch.x - 1, ch.y - 1, 2, 2);
    }

    // velocity vector: where you are actually going (crucial while sliding)
    if (p.speed > 5) {
      const vv = _v.copy(p.vel).normalize().multiplyScalar(450).add(p.pos);
      const pv = this.project(vv.clone(), cam);
      if (pv) {
        g.strokeStyle = p.sliding ? '#ffcf4d' : 'rgba(180,255,240,0.7)';
        g.beginPath();
        g.arc(pv.x, pv.y, 6, 0, Math.PI * 2);
        g.moveTo(pv.x - 14, pv.y);
        g.lineTo(pv.x - 6, pv.y);
        g.moveTo(pv.x + 6, pv.y);
        g.lineTo(pv.x + 14, pv.y);
        g.moveTo(pv.x, pv.y - 6);
        g.lineTo(pv.x, pv.y - 12);
        g.stroke();
      }
    }

    // mouse virtual stick
    if (d.cursor) {
      const R = Math.min(this.w, this.h) * 0.2;
      const cx = this.w / 2;
      const cy = this.h / 2;
      g.strokeStyle = 'rgba(77,252,210,0.18)';
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.stroke();
      const mx = cx + d.cursor.x * R;
      const my = cy + d.cursor.y * R;
      g.strokeStyle = 'rgba(77,252,210,0.35)';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(mx, my);
      g.stroke();
      g.strokeStyle = hudColor;
      g.beginPath();
      g.moveTo(mx - 6, my);
      g.lineTo(mx + 6, my);
      g.moveTo(mx, my - 6);
      g.lineTo(mx, my + 6);
      g.stroke();
    }

    // other ships
    for (const s of d.ships) {
      if (!s.alive || s === p) continue;
      const enemy = hostile(p.faction, s.faction);
      const color = enemy ? '#ff3b5c' : FACTIONS[s.faction].hudColor;
      const isTarget = s === p.target;
      const dist = s.pos.distanceTo(p.pos);
      const sp = this.project(s.pos, cam);
      const onScreen = sp && sp.x > 0 && sp.x < this.w && sp.y > 0 && sp.y < this.h;
      if (onScreen && sp) {
        const size = clamp((s.radius * 900) / Math.max(dist, 1), 9, 70) * (isTarget ? 1.25 : 1);
        g.strokeStyle = color;
        g.lineWidth = isTarget ? 2 : 1.3;
        this.brackets(sp.x, sp.y, size);
        if (isTarget) {
          g.fillStyle = color;
          g.textAlign = 'left';
          g.fillText(`${s.name}`, sp.x + size + 6, sp.y - 8);
          g.fillStyle = 'rgba(255,255,255,0.8)';
          g.fillText(`${Math.round(dist)} m`, sp.x + size + 6, sp.y + 8);
          this.bar(sp.x - size, sp.y + size + 6, size * 2, 3, s.shields / s.cls.shields, '#5fd0ff');
          this.bar(sp.x - size, sp.y + size + 11, size * 2, 3, s.hull / s.cls.hull, '#ffb347');
        }
      } else if (enemy || isTarget) {
        const e = this.edge(s.pos, cam);
        g.save();
        g.translate(e.x, e.y);
        g.rotate(e.a);
        g.fillStyle = color;
        g.globalAlpha = isTarget ? 1 : 0.65;
        const k = isTarget ? 1.4 : 1;
        g.beginPath();
        g.moveTo(10 * k, 0);
        g.lineTo(-6 * k, -7 * k);
        g.lineTo(-6 * k, 7 * k);
        g.closePath();
        g.fill();
        g.restore();
      }
      g.lineWidth = 1.5;
    }

    // lead indicator and lock
    const t = p.target;
    if (t && t.alive) {
      if (d.lead) {
        const lp = this.project(d.lead, cam);
        if (lp) {
          g.strokeStyle = '#ffcf4d';
          g.beginPath();
          g.moveTo(lp.x, lp.y - 8);
          g.lineTo(lp.x + 8, lp.y);
          g.lineTo(lp.x, lp.y + 8);
          g.lineTo(lp.x - 8, lp.y);
          g.closePath();
          g.stroke();
        }
      }
      const tp = this.project(t.pos, cam);
      if (tp && d.lockProgress > 0) {
        const r = d.locked ? 26 : 70 - d.lockProgress * 44;
        g.strokeStyle = d.locked ? '#ff5050' : 'rgba(255,200,80,0.85)';
        g.lineWidth = d.locked ? 2.5 : 1.5;
        g.save();
        g.translate(tp.x, tp.y);
        g.rotate(d.time * (d.locked ? 0 : 3));
        g.beginPath();
        g.moveTo(0, -r);
        g.lineTo(r, 0);
        g.lineTo(0, r);
        g.lineTo(-r, 0);
        g.closePath();
        g.stroke();
        g.restore();
        if (d.locked) {
          g.fillStyle = '#ff5050';
          g.textAlign = 'center';
          g.fillText('LOCK', tp.x, tp.y - 36);
        }
        g.lineWidth = 1.5;
      }
    }

    // incoming missiles
    if (d.incoming.length) {
      const blink = Math.sin(d.time * 18) > 0;
      if (blink) {
        g.fillStyle = '#ff3050';
        g.font = `700 22px ${FONT}`;
        g.textAlign = 'center';
        g.fillText('MISSILE', this.w / 2, this.h * 0.28);
        g.font = `600 13px ${FONT}`;
      }
      for (const m of d.incoming) {
        const e = this.edge(m, cam);
        const sp = this.project(m, cam);
        g.strokeStyle = '#ff3050';
        g.lineWidth = 2;
        if (sp && sp.x > 0 && sp.x < this.w && sp.y > 0 && sp.y < this.h) {
          g.beginPath();
          g.arc(sp.x, sp.y, 10, 0, Math.PI * 2);
          g.stroke();
        } else {
          g.save();
          g.translate(e.x, e.y);
          g.rotate(e.a);
          g.beginPath();
          g.moveTo(14, 0);
          g.lineTo(-8, -10);
          g.lineTo(-8, 10);
          g.closePath();
          g.stroke();
          g.restore();
        }
      }
      g.lineWidth = 1.5;
    }

    this.statusPanel(d);
    this.radar(d);

    // objective & hint
    g.textAlign = 'center';
    g.font = `600 15px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    if (d.objective) g.fillText(d.objective, this.w / 2, 26);
    if (d.hint) {
      g.font = `600 16px ${FONT}`;
      g.fillStyle = '#ffd36b';
      g.fillText(d.hint, this.w / 2, this.h * 0.72);
    }
    if (d.boundary && Math.sin(d.time * 8) > -0.3) {
      g.font = `700 18px ${FONT}`;
      g.fillStyle = '#ff9a3c';
      g.fillText('LEAVING THE OPERATIONS AREA. TURN BACK', this.w / 2, this.h * 0.34);
    }
  }

  private brackets(x: number, y: number, s: number): void {
    const g = this.ctx;
    const k = s * 0.4;
    g.beginPath();
    g.moveTo(x - s, y - s + k);
    g.lineTo(x - s, y - s);
    g.lineTo(x - s + k, y - s);
    g.moveTo(x + s - k, y - s);
    g.lineTo(x + s, y - s);
    g.lineTo(x + s, y - s + k);
    g.moveTo(x + s, y + s - k);
    g.lineTo(x + s, y + s);
    g.lineTo(x + s - k, y + s);
    g.moveTo(x - s + k, y + s);
    g.lineTo(x - s, y + s);
    g.lineTo(x - s, y + s - k);
    g.stroke();
  }

  private bar(x: number, y: number, w: number, h: number, frac: number, color: string): void {
    const g = this.ctx;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(x, y, w, h);
    g.fillStyle = color;
    g.fillRect(x, y, w * clamp(frac, 0, 1), h);
  }

  private statusPanel(d: HudData): void {
    const g = this.ctx;
    const p = d.player;
    const x = 28;
    const y = this.h - 120;
    const w = 220;
    g.textAlign = 'left';
    g.font = `600 12px ${FONT}`;
    const rows: [string, number, string][] = [
      ['SHIELD', p.shields / p.cls.shields, '#5fd0ff'],
      ['HULL', p.hull / p.cls.hull, p.hull / p.cls.hull < 0.35 ? '#ff4040' : '#ffb347'],
      ['ENERGY', p.energy / p.cls.energy, '#c08bff'],
    ];
    rows.forEach(([label, frac, color], i) => {
      const yy = y + i * 26;
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillText(label, x, yy);
      this.bar(x + 64, yy - 5, w - 64, 10, frac, color);
    });
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText(`MISSILES  ${p.missiles}`, x, y + 80);

    // speed block bottom right
    const rx = this.w - 28;
    g.textAlign = 'right';
    g.font = `700 34px ${FONT}`;
    g.fillStyle = p.boosting ? '#ffcf4d' : '#ffffff';
    g.fillText(`${Math.round(p.speed)}`, rx, this.h - 92);
    g.font = `600 12px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText('M/S', rx, this.h - 66);
    const tw = 160;
    this.bar(rx - tw, this.h - 50, tw, 8, p.controls.throttle, '#4dfcd2');
    g.fillText('THROTTLE', rx - tw - 8, this.h - 46);
    const tags: string[] = [];
    if (p.boosting) tags.push('BOOST');
    if (p.sliding) tags.push('SLIDE');
    if (tags.length) {
      g.font = `700 16px ${FONT}`;
      g.fillStyle = p.sliding ? '#ffcf4d' : '#ff9a3c';
      g.fillText(tags.join('  '), rx, this.h - 124);
    }
  }

  private radar(d: HudData): void {
    const g = this.ctx;
    const p = d.player;
    const R = 72;
    const cx = this.w / 2;
    const cy = this.h - R - 22;
    const range = 1800;
    g.fillStyle = 'rgba(5,10,25,0.45)';
    g.strokeStyle = 'rgba(77,252,210,0.35)';
    g.beginPath();
    g.ellipse(cx, cy, R, R * 0.62, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.ellipse(cx, cy, R * 0.5, R * 0.31, 0, 0, Math.PI * 2);
    g.stroke();
    _inv.copy(p.quat).invert();
    for (const s of d.ships) {
      if (!s.alive || s === p) continue;
      _v.subVectors(s.pos, p.pos).applyQuaternion(_inv);
      const dist = _v.length();
      const k = Math.min(dist, range) / range / Math.max(Math.hypot(_v.x, _v.z), 1e-3);
      const x = cx + _v.x * k * R;
      const y = cy + _v.z * k * R * 0.62;
      const hgt = clamp(-_v.y / range, -1, 1) * R * 0.5;
      const color = hostile(p.faction, s.faction) ? '#ff3b5c' : FACTIONS[s.faction].hudColor;
      g.strokeStyle = color;
      g.globalAlpha = 0.7;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + hgt);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = color;
      const sz = s === p.target ? 4 : s.radius > 8 ? 4 : 2.5;
      g.fillRect(x - sz, y + hgt - sz, sz * 2, sz * 2);
    }
    g.fillStyle = '#4dfcd2';
    g.beginPath();
    g.moveTo(cx, cy - 5);
    g.lineTo(cx + 4, cy + 4);
    g.lineTo(cx - 4, cy + 4);
    g.closePath();
    g.fill();
  }
}
