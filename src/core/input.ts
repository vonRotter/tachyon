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

/** Every rebindable keyboard/mouse action. */
export type BindAction =
  | 'throttleUp'
  | 'throttleDown'
  | 'pitchUp'
  | 'pitchDown'
  | 'yawLeft'
  | 'yawRight'
  | 'rollLeft'
  | 'rollRight'
  | 'strafeLeft'
  | 'strafeRight'
  | 'strafeUp'
  | 'strafeDown'
  | 'boost'
  | 'slide'
  | 'fire'
  | 'missile'
  | 'targetNearest'
  | 'targetNext'
  | 'matchSpeed'
  | 'camera'
  | 'centerMouse'
  | 'pause';

/** One-shot actions the game polls with `pressed()`. `confirm` is fixed (Enter / pad A). */
export type Action = 'targetNext' | 'targetNearest' | 'camera' | 'pause' | 'centerMouse' | 'matchSpeed' | 'confirm';

export type Bindings = Record<BindAction, string[]>;

export const BIND_LABELS: [BindAction, string][] = [
  ['throttleUp', 'Throttle up'],
  ['throttleDown', 'Throttle down'],
  ['pitchUp', 'Pitch up'],
  ['pitchDown', 'Pitch down'],
  ['yawLeft', 'Yaw left'],
  ['yawRight', 'Yaw right'],
  ['rollLeft', 'Roll left'],
  ['rollRight', 'Roll right'],
  ['strafeLeft', 'Strafe left'],
  ['strafeRight', 'Strafe right'],
  ['strafeUp', 'Strafe up'],
  ['strafeDown', 'Strafe down'],
  ['boost', 'Boost'],
  ['slide', 'Slide (hold)'],
  ['fire', 'Fire guns'],
  ['missile', 'Fire missile'],
  ['targetNearest', 'Target nearest'],
  ['targetNext', 'Next target'],
  ['matchSpeed', 'Match target speed'],
  ['camera', 'Toggle camera'],
  ['centerMouse', 'Recentre mouse stick'],
  ['pause', 'Pause (Esc always works)'],
];

export const DEFAULT_BINDINGS: Bindings = {
  throttleUp: ['KeyW'],
  throttleDown: ['KeyS'],
  pitchUp: ['ArrowUp'],
  pitchDown: ['ArrowDown'],
  yawLeft: ['ArrowLeft'],
  yawRight: ['ArrowRight'],
  rollLeft: ['KeyQ'],
  rollRight: ['KeyE'],
  strafeLeft: ['KeyA'],
  strafeRight: ['KeyD'],
  strafeUp: ['KeyR'],
  strafeDown: ['KeyF'],
  boost: ['ShiftLeft', 'ShiftRight'],
  slide: ['Space'],
  fire: ['Mouse0', 'ControlLeft'],
  missile: ['Mouse2', 'KeyG'],
  targetNearest: ['KeyT'],
  targetNext: ['Tab'],
  matchSpeed: ['KeyZ'],
  camera: ['KeyC'],
  centerMouse: ['KeyX'],
  pause: ['KeyP'],
};

const EDGE_ACTIONS: Partial<Record<BindAction, Action>> = {
  targetNearest: 'targetNearest',
  targetNext: 'targetNext',
  matchSpeed: 'matchSpeed',
  camera: 'camera',
  centerMouse: 'centerMouse',
  pause: 'pause',
};

/** Human-readable name for a key code or mouse button ("Mouse0"). */
export function keyLabel(code: string | undefined): string {
  if (!code) return '—';
  const special: Record<string, string> = {
    Mouse0: 'Left click',
    Mouse1: 'Middle click',
    Mouse2: 'Right click',
    Mouse3: 'Mouse 4',
    Mouse4: 'Mouse 5',
    Space: 'Space',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt',
    AltRight: 'Right Alt',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Tab: 'Tab',
    Enter: 'Enter',
    Backspace: 'Backspace',
    CapsLock: 'Caps Lock',
  };
  if (special[code]) return special[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
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

export interface InputSettings {
  invertMouseY: boolean;
  invertPadY: boolean;
  mouseSensitivity: number;
}

/**
 * Unifies keyboard, mouse (virtual joystick under pointer lock) and gamepad. Keyboard and mouse
 * buttons go through a rebindable action map; mouse buttons appear as "Mouse0".."Mouse4".
 */
export class Input {
  readonly settings: InputSettings = { invertMouseY: false, invertPadY: false, mouseSensitivity: 1 };
  device: 'mouse' | 'gamepad' = 'mouse';
  bindings: Bindings = cloneBindings(DEFAULT_BINDINGS);
  private codeToActions = new Map<string, BindAction[]>();
  /** Held keys and mouse buttons. */
  private readonly held = new Set<string>();
  private readonly actionsPressed = new Set<Action>();
  private missileEdge = false;
  /** Set while a menu captures a key for rebinding: gameplay ignores input. */
  suspended = false;
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
    this.setBindings(this.bindings);
    window.addEventListener('keydown', (e) => {
      if (this.suspended) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.onDown(e.code);
      this.held.add(e.code);
      this.device = 'mouse';
      this.anyKeyPressed = true;
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
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
      if (this.suspended) return;
      const code = `Mouse${e.button}`;
      this.held.add(code);
      // mouse buttons only count as flight controls while the pointer is captured, so clicking
      // menu buttons never fires guns
      if (this.pointerLocked) this.onDown(code);
      this.device = 'mouse';
      this.anyKeyPressed = true;
    });
    window.addEventListener('mouseup', (e) => this.held.delete(`Mouse${e.button}`));
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
  }

  setBindings(b: Bindings): void {
    this.bindings = cloneBindings(b);
    this.codeToActions.clear();
    for (const [action, codes] of Object.entries(this.bindings) as [BindAction, string[]][]) {
      for (const c of codes) {
        const list = this.codeToActions.get(c) ?? [];
        list.push(action);
        this.codeToActions.set(c, list);
      }
    }
  }

  /** Primary binding label for prompts and hints. */
  label(action: BindAction): string {
    return keyLabel(this.bindings[action][0]);
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

  private onDown(code: string): void {
    if (code === 'Escape') this.actionsPressed.add('pause');
    if (code === 'Enter') this.actionsPressed.add('confirm');
    for (const a of this.codeToActions.get(code) ?? []) {
      const edge = EDGE_ACTIONS[a];
      if (edge) this.actionsPressed.add(edge);
      if (a === 'missile') this.missileEdge = true;
    }
  }

  private down(action: BindAction): boolean {
    for (const c of this.bindings[action]) {
      if (!this.held.has(c)) continue;
      // mouse buttons only fly the ship while the pointer is captured
      if (c.startsWith('Mouse') && !this.pointerLocked) continue;
      return true;
    }
    return false;
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
    if (this.suspended) return;
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

  /** Swallows a pending one-shot action (a menu already handled the key). */
  consume(a: Action): void {
    this.actionsPressed.delete(a);
  }

  /** Call at the end of each frame. */
  endFrame(): void {
    this.actionsPressed.clear();
    this.missileEdge = false;
    this.padMissileEdge = false;
    this.anyKeyPressed = false;
  }

  centerCursor(): void {
    this.cursor.x = 0;
    this.cursor.y = 0;
  }

  read(): FlightInput {
    const k = (a: BindAction) => (this.down(a) ? 1 : 0);
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
    if (this.suspended) return out;

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
    // Keyboard and mouse buttons through the binding map
    out.pitch += k('pitchUp') - k('pitchDown');
    out.yaw += k('yawRight') - k('yawLeft');
    out.roll += k('rollRight') - k('rollLeft');
    out.strafeX += k('strafeRight') - k('strafeLeft');
    out.strafeY += k('strafeUp') - k('strafeDown');
    out.throttleDelta += k('throttleUp') - k('throttleDown');
    out.boost = this.down('boost');
    out.slide = this.down('slide');
    out.fire = this.down('fire');
    out.missile = this.missileEdge;

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

export function cloneBindings(b: Bindings): Bindings {
  const out = {} as Bindings;
  for (const [k, v] of Object.entries(b) as [BindAction, string[]][]) out[k] = [...v];
  return out;
}
