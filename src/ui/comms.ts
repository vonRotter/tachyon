import { SeededRandom } from '../core/math';
import type { Radio, RadioBand, RadioClip } from '../core/radio';
import voiceManifest from './voiceManifest.json';

export interface Speaker {
  id: string;
  name: string;
  title: string;
  color: string;
  skin: string;
  hair: string;
  seed: number;
  /** Whose radio sets they use: sets the transmission sound of their recorded lines. */
  band: RadioBand;
  /** Browser speech synthesis tuning, for lines without a recording. */
  pitch: number;
  rate: number;
  voiceHint: 'female' | 'male';
}

export const SPEAKERS: Record<string, Speaker> = {
  tamsin: {
    id: 'tamsin',
    band: 'kestrel',
    name: 'Mara Tamsin',
    title: 'Caravan master, Tamsin Freight',
    color: '#4dfcd2',
    skin: '#d8a888',
    hair: '#8a5a3c',
    seed: 137,
    pitch: 0.95,
    rate: 1.0,
    voiceHint: 'female',
  },
  dace: {
    id: 'dace',
    band: 'kestrel',
    name: 'Dace Morrow',
    title: 'Escort pilot, Tamsin Freight',
    color: '#4dfcd2',
    skin: '#6a4630',
    hair: '#2a2420',
    seed: 149,
    pitch: 1.05,
    rate: 1.1,
    voiceHint: 'male',
  },
  varga: {
    id: 'varga',
    band: 'kestrel',
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
    band: 'kestrel',
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
    band: 'kestrel',
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
    band: 'wake',
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
    band: 'combine',
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
  quell: {
    id: 'quell',
    band: 'combine',
    name: 'Mara Quell',
    title: 'Deck Officer, CHV Sovereign Dawn',
    color: '#f6f0e0',
    skin: '#c79a7e',
    hair: '#3a2a22',
    seed: 53,
    pitch: 1.05,
    rate: 1.05,
    voiceHint: 'female',
  },
  meridian: {
    id: 'meridian',
    band: 'combine',
    name: 'Meridian Control',
    title: 'Helion Combine carrier Meridian',
    color: '#f6f0e0',
    skin: '#b8906e',
    hair: '#5a4a3a',
    seed: 109,
    pitch: 0.92,
    rate: 1.05,
    voiceHint: 'male',
  },
  vale: {
    id: 'vale',
    band: 'combine',
    name: 'Lt. Orsino Vale',
    title: 'Helion Combine, Lance lead',
    color: '#e0a83c',
    skin: '#a8765a',
    hair: '#14141a',
    seed: 61,
    pitch: 0.95,
    rate: 1.0,
    voiceHint: 'male',
  },
  nessa: {
    id: 'nessa',
    band: 'wake',
    name: 'Nessa Coil',
    title: 'Habitat module, the Gallows',
    color: '#ff8a6a',
    skin: '#e0b896',
    hair: '#ff6a3a',
    seed: 71,
    pitch: 1.1,
    rate: 1.08,
    voiceHint: 'female',
  },
  kit: {
    id: 'kit',
    band: 'drift',
    name: 'Kit Marlowe',
    title: 'Drift Union, escort pilot',
    color: '#9cff6a',
    skin: '#7a5238',
    hair: '#f2e8d2',
    seed: 83,
    pitch: 1.1,
    rate: 1.1,
    voiceHint: 'female',
  },
  magpie: {
    id: 'magpie',
    band: 'drift',
    name: 'Abel "Magpie" Ross',
    title: 'Drift Union, shuttle Magpie',
    color: '#c6ff5a',
    skin: '#d2a07a',
    hair: '#8a5a2a',
    seed: 97,
    pitch: 0.9,
    rate: 1.0,
    voiceHint: 'male',
  },
  baron: {
    id: 'baron',
    band: 'rose',
    name: 'Baron Rafe Delacourt',
    title: 'The Scarlet Baron',
    color: '#ff6a8a',
    skin: '#e0b89a',
    hair: '#2a1a14',
    seed: 1915,
    pitch: 1.0,
    rate: 1.02,
    voiceHint: 'male',
  },
  petal: {
    id: 'petal',
    band: 'rose',
    name: 'Petal',
    title: 'Rosebud Two',
    color: '#ff9aae',
    skin: '#c89a78',
    hair: '#d8a040',
    seed: 1917,
    pitch: 1.1,
    rate: 1.08,
    voiceHint: 'female',
  },
  strand: {
    id: 'strand',
    band: 'combine',
    name: 'Lady Imelda Strand',
    title: 'Aboard the liner Aurelian Dawn',
    color: '#f6f0e0',
    skin: '#f0d0b8',
    hair: '#c8c8d0',
    seed: 333,
    pitch: 1.05,
    rate: 0.96,
    voiceHint: 'female',
  },
  okafor: {
    id: 'okafor',
    band: 'patrol',
    name: 'Sgt. Dana Okafor',
    title: 'Reach Patrol, Interdictor 4',
    color: '#8fb8ff',
    skin: '#7a4e34',
    hair: '#1a1a1a',
    seed: 401,
    pitch: 1.0,
    rate: 1.04,
    voiceHint: 'female',
  },
  halloran: {
    id: 'halloran',
    band: 'kestrel',
    name: 'Dr. Imre Halloran',
    title: 'Director, Vantage Station',
    color: '#ffb36a',
    skin: '#c8956e',
    hair: '#d8d8d8',
    seed: 211,
    pitch: 0.95,
    rate: 0.98,
    voiceHint: 'male',
  },
  sorrel: {
    id: 'sorrel',
    band: 'drift',
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

/** FNV-1a of "speaker|text"; must match fnv1a() in scripts/voices/generate.py. */
export function voiceKey(speaker: string, text: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(`${speaker}|${text}`)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const VOICED = voiceManifest as Record<string, { speaker: string; duration: number }>;
const voiceUrl = (key: string): string => `${import.meta.env.BASE_URL}voice/${key}.mp3`;

interface Current {
  line: Line;
  shown: number;
  /** Characters revealed per second. */
  revealRate: number;
  hold: number;
  resolve: () => void;
  /** Seconds left to wait for a recording to load before showing the line without it. */
  waiting: number;
  clip: RadioClip | null;
}

/**
 * Radio channel: one line at a time with a typewriter reveal. `say` resolves when the line has
 * had time to be read (or has been spoken), so mission scripts can simply `await` dialogue.
 *
 * Lines with a recording (src/ui/voiceManifest.json) play through the speaker's faction radio
 * band; others fall back to browser speech synthesis when that is enabled.
 */
export class Comms {
  private readonly root: HTMLElement;
  private readonly portrait: HTMLCanvasElement;
  private readonly nameEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly portraits = new Map<string, HTMLCanvasElement>();
  private current: Current | null = null;
  private readonly queue: { line: Line; resolve: () => void }[] = [];
  private paused = false;
  /** Play recorded dialogue. */
  voiceEnabled = true;
  /** Speak lines that have no recording with the browser's speech synthesis. */
  ttsEnabled = false;
  /** Supplied by the game once audio is running. */
  radio: () => Radio | null = () => null;
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

  /** Starts fetching every recorded line so playback does not wait on the network. */
  preloadVoices(): void {
    const radio = this.radio();
    if (!radio || !this.voiceEnabled) return;
    for (const key of Object.keys(VOICED)) void radio.load(voiceUrl(key));
  }

  /** Pauses or resumes the current transmission with the game. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.current?.clip?.pause();
    else this.current?.clip?.play();
  }

  clear(): void {
    for (const q of this.queue) q.resolve();
    this.queue.length = 0;
    if (this.current) {
      this.current.clip?.stop();
      this.current.resolve();
    }
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
      this.begin(next.line, next.resolve);
    }
    const c = this.current;
    if (!c) return;
    if (c.waiting > 0) {
      c.waiting -= dt;
      if (c.waiting > 0) return;
    }
    c.shown += dt * c.revealRate;
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

  private begin(line: Line, resolve: () => void): void {
    const s = SPEAKERS[line.speaker];
    const c: Current = {
      line,
      shown: 0,
      revealRate: 55,
      hold: 1.2 + line.text.length * 0.032,
      resolve,
      waiting: 0,
      clip: null,
    };
    this.current = c;
    this.log.push(line);
    const g = this.portrait.getContext('2d');
    if (g && s) {
      g.clearRect(0, 0, this.portrait.width, this.portrait.height);
      g.drawImage(this.portraitFor(s), 0, 0, this.portrait.width, this.portrait.height);
    }
    this.nameEl.textContent = s ? s.name : line.speaker;
    this.nameEl.style.color = s ? s.color : '#fff';
    this.titleEl.textContent = s ? s.title : '';
    this.textEl.textContent = '';
    this.root.style.setProperty('--accent', s ? s.color : '#fff');
    this.root.classList.add('visible');
    const radio = this.radio();
    if (!s) return;
    radio?.chirp(s.band);

    const key = voiceKey(line.speaker, line.text);
    if (radio && this.voiceEnabled && VOICED[key]) {
      c.waiting = 1.5;
      void radio.load(voiceUrl(key)).then((buffer) => {
        if (this.current !== c) return;
        c.waiting = 0;
        if (!buffer) return; // missing file: the line just shows as text
        c.clip = radio.transmit(buffer, s.band, () => {
          if (this.current === c) c.hold = Math.min(c.hold, 0.5);
        });
        // finish typing a little before the speaker does; hold until the transmission ends
        c.revealRate = line.text.length / Math.max(0.6, buffer.duration * 0.85);
        c.hold = buffer.duration + 1;
        if (!this.paused) c.clip.play();
      });
    } else if (this.ttsEnabled) {
      const spoken = speak(line.text, s, () => {
        if (this.current === c) c.hold = Math.min(c.hold, 0.6);
      });
      if (spoken) c.hold += 4;
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
