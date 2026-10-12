import { SeededRandom } from '../core/math';

export interface Speaker {
  id: string;
  name: string;
  title: string;
  color: string;
  skin: string;
  hair: string;
  seed: number;
  /** Speech synthesis tuning. */
  pitch: number;
  rate: number;
  voiceHint: 'female' | 'male';
}

export const SPEAKERS: Record<string, Speaker> = {
  varga: {
    id: 'varga',
    name: 'Ilse Varga',
    title: 'Dockmaster, Kestrel Control',
    color: '#ffd84d',
    skin: '#c99a7a',
    hair: '#d8d2c8',
    seed: 3,
    pitch: 0.9,
    rate: 1.05,
    voiceHint: 'female',
  },
  juno: {
    id: 'juno',
    name: 'Juno Achterberg',
    title: 'Kestrel Militia, Warden 1',
    color: '#ffd84d',
    skin: '#8a5a3c',
    hair: '#ff4f8a',
    seed: 11,
    pitch: 1.15,
    rate: 1.12,
    voiceHint: 'female',
  },
  pike: {
    id: 'pike',
    name: 'Tomas "Pike" Reyes',
    title: 'Kestrel Militia, Warden 2',
    color: '#ffd84d',
    skin: '#b07850',
    hair: '#1a1a22',
    seed: 17,
    pitch: 0.95,
    rate: 1.1,
    voiceHint: 'male',
  },
  vey: {
    id: 'vey',
    name: 'Kaspar Vey',
    title: 'Red Wake',
    color: '#ff3b5c',
    skin: '#d8b090',
    hair: '#2a0a10',
    seed: 23,
    pitch: 0.7,
    rate: 0.95,
    voiceHint: 'male',
  },
  tessaine: {
    id: 'tessaine',
    name: 'Cmdr. Aurel Tessaine',
    title: 'Helion Combine, CHV Sovereign Dawn',
    color: '#f6f0e0',
    skin: '#e8c8a8',
    hair: '#e0a83c',
    seed: 31,
    pitch: 1.0,
    rate: 0.92,
    voiceHint: 'male',
  },
  sorrel: {
    id: 'sorrel',
    name: 'Mother Sorrel',
    title: 'Speaker, Drift Union',
    color: '#9cff6a',
    skin: '#6a4630',
    hair: '#9cff6a',
    seed: 41,
    pitch: 0.85,
    rate: 0.9,
    voiceHint: 'female',
  },
};

/** Draws a stylised, scanlined comms portrait for a speaker. */
function drawPortrait(canvas: HTMLCanvasElement, s: Speaker): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  const rng = new SeededRandom(s.seed);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, s.color);
  bg.addColorStop(1, '#0a0614');
  g.globalAlpha = 0.35;
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
  // shoulders
  g.fillStyle = '#1b1830';
  g.beginPath();
  g.ellipse(W / 2, H * 1.02, W * 0.48, H * 0.3, 0, Math.PI, 0);
  g.fill();
  g.fillStyle = s.color;
  g.fillRect(W * 0.2, H * 0.86, W * 0.6, 3);
  // neck & head
  g.fillStyle = s.skin;
  g.fillRect(W * 0.43, H * 0.58, W * 0.14, H * 0.16);
  const headW = W * rng.range(0.19, 0.23);
  const headH = H * rng.range(0.25, 0.29);
  g.beginPath();
  g.ellipse(W / 2, H * 0.45, headW, headH, 0, 0, Math.PI * 2);
  g.fill();
  // hair
  g.fillStyle = s.hair;
  const style = rng.int(0, 2);
  g.beginPath();
  if (style === 0) {
    g.ellipse(W / 2, H * 0.33, headW * 1.05, headH * 0.55, 0, Math.PI, 0);
  } else if (style === 1) {
    g.ellipse(W / 2, H * 0.36, headW * 1.15, headH * 0.7, 0, Math.PI * 1.05, -0.05);
    g.rect(W / 2 - headW * 1.15, H * 0.36, headW * 0.35, headH * 0.9);
  } else {
    g.moveTo(W / 2 - headW, H * 0.4);
    g.lineTo(W / 2 - headW * 0.2, H * 0.12);
    g.lineTo(W / 2 + headW * 0.4, H * 0.15);
    g.lineTo(W / 2 + headW, H * 0.4);
  }
  g.fill();
  // eyes
  g.fillStyle = '#0c0a14';
  const ey = H * 0.46;
  g.fillRect(W / 2 - headW * 0.55, ey, headW * 0.32, 3);
  g.fillRect(W / 2 + headW * 0.23, ey, headW * 0.32, 3);
  if (rng.next() > 0.5) {
    g.fillStyle = s.color;
    g.fillRect(W / 2 + headW * 0.15, ey - 3, headW * 0.5, 8);
  }
  // scanlines
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
}

export interface Line {
  speaker: string;
  text: string;
}

/**
 * Radio channel: one line at a time with a typewriter reveal. `say` resolves when the line has
 * had time to be read (or spoken), so mission scripts can simply `await` dialogue.
 */
export class Comms {
  private readonly root: HTMLElement;
  private readonly portrait: HTMLCanvasElement;
  private readonly nameEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly portraits = new Map<string, HTMLCanvasElement>();
  private current: { line: Line; shown: number; hold: number; resolve: () => void; spoken: boolean } | null = null;
  private readonly queue: { line: Line; resolve: () => void }[] = [];
  voiceEnabled = false;
  onChirp: (() => void) | null = null;
  readonly log: Line[] = [];

  constructor() {
    this.root = document.getElementById('comms') as HTMLElement;
    this.portrait = this.root.querySelector('canvas') as HTMLCanvasElement;
    this.nameEl = this.root.querySelector('.name') as HTMLElement;
    this.titleEl = this.root.querySelector('.title') as HTMLElement;
    this.textEl = this.root.querySelector('.text') as HTMLElement;
  }

  say(speaker: string, text: string): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push({ line: { speaker, text }, resolve });
    });
  }

  clear(): void {
    for (const q of this.queue) q.resolve();
    this.queue.length = 0;
    if (this.current) this.current.resolve();
    this.current = null;
    this.root.classList.remove('visible');
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  private portraitFor(s: Speaker): HTMLCanvasElement {
    let c = this.portraits.get(s.id);
    if (!c) {
      c = document.createElement('canvas');
      c.width = 96;
      c.height = 96;
      drawPortrait(c, s);
      this.portraits.set(s.id, c);
    }
    return c;
  }

  update(dt: number): void {
    if (!this.current) {
      const next = this.queue.shift();
      if (!next) return;
      const s = SPEAKERS[next.line.speaker];
      this.current = {
        line: next.line,
        shown: 0,
        hold: 1.2 + next.line.text.length * 0.032,
        resolve: next.resolve,
        spoken: false,
      };
      this.log.push(next.line);
      const g = this.portrait.getContext('2d');
      if (g && s) {
        g.clearRect(0, 0, this.portrait.width, this.portrait.height);
        g.drawImage(this.portraitFor(s), 0, 0, this.portrait.width, this.portrait.height);
      }
      this.nameEl.textContent = s ? s.name : next.line.speaker;
      this.nameEl.style.color = s ? s.color : '#fff';
      this.titleEl.textContent = s ? s.title : '';
      this.root.style.setProperty('--accent', s ? s.color : '#fff');
      this.root.classList.add('visible');
      this.onChirp?.();
      if (this.voiceEnabled && s) {
        this.current.spoken = speak(next.line.text, s, () => {
          if (this.current && this.current.line === next.line) this.current.hold = Math.min(this.current.hold, 0.6);
        });
        if (this.current.spoken) this.current.hold += 4;
      }
    }
    const c = this.current;
    if (!c) return;
    c.shown += dt * 55;
    const n = Math.min(c.line.text.length, Math.floor(c.shown));
    this.textEl.textContent = c.line.text.slice(0, n);
    if (n >= c.line.text.length) {
      c.hold -= dt;
      if (c.hold <= 0) {
        c.resolve();
        this.current = null;
        if (!this.queue.length) this.root.classList.remove('visible');
      }
    }
  }
}

let cachedVoices: SpeechSynthesisVoice[] = [];
if ('speechSynthesis' in window) {
  const load = () => {
    cachedVoices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
  };
  load();
  window.speechSynthesis.addEventListener?.('voiceschanged', load);
}

const FEMALE = /female|woman|zira|samantha|victoria|karen|moira|tessa|fiona|susan|hazel|jenny|aria|libby|sonia/i;
const MALE = /\bmale\b|david|mark|daniel|alex|fred|george|guy|ryan|thomas|oliver|arthur/i;

/** Browser speech synthesis. Returns false if unavailable. Quality depends on the OS voices. */
function speak(text: string, s: Speaker, onEnd: () => void): boolean {
  if (!('speechSynthesis' in window) || !cachedVoices.length) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const pref = cachedVoices.filter((v) => (s.voiceHint === 'female' ? FEMALE : MALE).test(v.name));
  const pool = pref.length ? pref : cachedVoices;
  u.voice = pool[s.seed % pool.length];
  u.pitch = s.pitch;
  u.rate = s.rate;
  u.volume = 0.9;
  u.onend = onEnd;
  synth.speak(u);
  return true;
}
