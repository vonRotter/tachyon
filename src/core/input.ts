import { clamp } from './math';

export interface FlightInput {
  pitch: number; // +1 nose up
  yaw: number; // +1 nose right
  roll: number; // +1 roll right
  throttleDelta: number; // -1..1 per second
  strafeX: number;
  strafeY: number;
  boost: boolean;
  slide: boolean;
  fire: boolean;
  missile: boolean;
}

export type Action = 'targetNext' | 'targetNearest' | 'camera' | 'pause' | 'centerMouse' | 'matchSpeed' | 'confirm';

export interface InputSettings {
  invertMouseY: boolean;
  invertPadY: boolean;
  mouseSensitivity: number;
}

// Standard Gamepad mapping: identical indices for Xbox and PlayStation pads.
const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

const deadzone = (v: number, dz = 0.12): number => {
  const a = Math.abs(v);
  if (a < dz) return 0;
  return Math.sign(v) * ((a - dz) / (1 - dz));
};

const curve = (v: number, p = 1.6): number => Math.sign(v) * Math.pow(Math.abs(v), p);

/**
 * Unifies keyboard, mouse (virtual joystick under pointer lock) and gamepad. Whichever device
 * was touched last drives the HUD prompts.
 */
export class Input {
  readonly settings: InputSettings = { invertMouseY: false, invertPadY: false, mouseSensitivity: 1 };
  device: 'mouse' | 'gamepad' = 'mouse';
  private readonly keys = new Set<string>();
  private readonly actionsPressed = new Set<Action>();
  private mouseButtons = 0;
  private mouseMissileEdge = false;
  /** Virtual stick position, unit disc. */
  readonly cursor = { x: 0, y: 0 };
  pointerLocked = false;
  private padButtons: boolean[] = [];
  private padPrev: boolean[] = [];
  private padAxes: number[] = [0, 0, 0, 0];
  private padTriggers = { lt: 0, rt: 0 };
  private padConnected = false;
  private padMissileEdge = false;
  anyKeyPressed = false;

  constructor(private readonly canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.onKeyEdge(e.code);
      this.keys.add(e.code);
      this.device = 'mouse';
      this.anyKeyPressed = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseButtons = 0;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      const s = 0.0028 * this.settings.mouseSensitivity;
      this.cursor.x += e.movementX * s;
      this.cursor.y += e.movementY * s;
      const len = Math.hypot(this.cursor.x, this.cursor.y);
      if (len > 1) {
        this.cursor.x /= len;
        this.cursor.y /= len;
      }
      this.device = 'mouse';
    });
    window.addEventListener('mousedown', (e) => {
      this.mouseButtons |= 1 << e.button;
      if (e.button === 2) this.mouseMissileEdge = true;
      this.device = 'mouse';
      this.anyKeyPressed = true;
    });
    window.addEventListener('mouseup', (e) => {
      this.mouseButtons &= ~(1 << e.button);
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
  }

  requestPointerLock(): void {
    if (document.pointerLockElement !== this.canvas) {
      const req = this.canvas.requestPointerLock() as unknown;
      if (req instanceof Promise) req.catch(() => undefined);
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private onKeyEdge(code: string): void {
    switch (code) {
      case 'Tab':
        this.actionsPressed.add('targetNext');
        break;
      case 'KeyT':
        this.actionsPressed.add('targetNearest');
        break;
      case 'KeyC':
        this.actionsPressed.add('camera');
        break;
      case 'Escape':
      case 'KeyP':
        this.actionsPressed.add('pause');
        break;
      case 'KeyX':
        this.actionsPressed.add('centerMouse');
        break;
      case 'KeyZ':
        this.actionsPressed.add('matchSpeed');
        break;
      case 'Enter':
        this.actionsPressed.add('confirm');
        break;
    }
  }

  /** Call once per frame before reading. */
  poll(): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    this.padConnected = pad !== null;
    if (!pad) return;
    this.padPrev = this.padButtons;
    this.padButtons = pad.buttons.map((b) => b.pressed);
    this.padAxes = [pad.axes[0] ?? 0, pad.axes[1] ?? 0, pad.axes[2] ?? 0, pad.axes[3] ?? 0];
    this.padTriggers.lt = pad.buttons[PAD.LT]?.value ?? 0;
    this.padTriggers.rt = pad.buttons[PAD.RT]?.value ?? 0;
    const active =
      this.padButtons.some((b) => b) || this.padAxes.some((a) => Math.abs(a) > 0.3) || this.padTriggers.rt > 0.2;
    if (active) {
      this.device = 'gamepad';
      this.anyKeyPressed = true;
    }
    const edge = (i: number) => this.padButtons[i] && !this.padPrev[i];
    if (edge(PAD.LB)) this.actionsPressed.add('targetNext');
    if (edge(PAD.Y)) this.actionsPressed.add('targetNearest');
    if (edge(PAD.BACK) || edge(PAD.R3)) this.actionsPressed.add('camera');
    if (edge(PAD.START)) this.actionsPressed.add('pause');
    if (edge(PAD.L3)) this.actionsPressed.add('matchSpeed');
    if (edge(PAD.A)) this.actionsPressed.add('confirm');
    if (edge(PAD.RB)) this.padMissileEdge = true;
  }

  get gamepadConnected(): boolean {
    return this.padConnected;
  }

  pressed(a: Action): boolean {
    return this.actionsPressed.has(a);
  }

  /** Call at the end of each frame. */
  endFrame(): void {
    this.actionsPressed.clear();
    this.mouseMissileEdge = false;
    this.padMissileEdge = false;
    this.anyKeyPressed = false;
  }

  centerCursor(): void {
    this.cursor.x = 0;
    this.cursor.y = 0;
  }

  read(): FlightInput {
    const k = (c: string) => (this.keys.has(c) ? 1 : 0);
    const out: FlightInput = {
      pitch: 0,
      yaw: 0,
      roll: 0,
      throttleDelta: 0,
      strafeX: 0,
      strafeY: 0,
      boost: false,
      slide: false,
      fire: false,
      missile: false,
    };

    // Mouse virtual stick
    if (this.pointerLocked) {
      const dz = 0.05;
      const len = Math.hypot(this.cursor.x, this.cursor.y);
      if (len > dz) {
        const scale = (len - dz) / (1 - dz) / len;
        const yInv = this.settings.invertMouseY ? -1 : 1;
        out.yaw += curve(this.cursor.x * scale, 1.3);
        out.pitch += -curve(this.cursor.y * scale, 1.3) * yInv;
      }
    }
    // Keyboard
    out.pitch += k('ArrowUp') - k('ArrowDown');
    out.yaw += k('ArrowRight') - k('ArrowLeft');
    out.roll += k('KeyE') - k('KeyQ');
    out.strafeX += k('KeyD') - k('KeyA');
    out.strafeY += k('KeyR') - k('KeyF');
    out.throttleDelta += k('KeyW') - k('KeyS');
    out.boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    out.slide = this.keys.has('Space');
    out.fire = (this.mouseButtons & 1) !== 0 || this.keys.has('ControlLeft');
    out.missile = this.mouseMissileEdge || this.keys.has('KeyG');

    // Gamepad
    if (this.padConnected) {
      const [lx, ly, rx, ry] = this.padAxes.map((a) => deadzone(a));
      const yInv = this.settings.invertPadY ? -1 : 1;
      out.yaw += curve(rx);
      out.pitch += -curve(ry) * yInv;
      out.roll += curve(lx, 1.3);
      out.throttleDelta += -ly;
      const b = this.padButtons;
      out.strafeX += (b[PAD.RIGHT] ? 1 : 0) - (b[PAD.LEFT] ? 1 : 0);
      out.strafeY += (b[PAD.UP] ? 1 : 0) - (b[PAD.DOWN] ? 1 : 0);
      out.boost ||= !!b[PAD.A] || !!b[PAD.X];
      out.slide ||= this.padTriggers.lt > 0.4;
      out.fire ||= this.padTriggers.rt > 0.35;
      out.missile ||= this.padMissileEdge;
    }

    out.pitch = clamp(out.pitch, -1, 1);
    out.yaw = clamp(out.yaw, -1, 1);
    out.roll = clamp(out.roll, -1, 1);
    out.strafeX = clamp(out.strafeX, -1, 1);
    out.strafeY = clamp(out.strafeY, -1, 1);
    out.throttleDelta = clamp(out.throttleDelta, -1, 1);
    return out;
  }
}
