/**
 * Radio voice playback. Dialogue is pre-recorded clean speech (see scripts/voices); each faction's
 * transmitter colours it differently, so who is talking can be told by ear as well as by name:
 * Kestrel militia sets are a plain comms band, the Red Wake's are overdriven and crackling, the
 * Combine's are wide and clean, the Drift Union's are old gear that hisses and wavers, and the
 * Reach Patrol's are crisp digital sets with a two-tone chirp, and the Scarlet Baron transmits on
 * a warm old set that crackles like a gramophone.
 */

export type RadioBand = 'kestrel' | 'wake' | 'combine' | 'drift' | 'patrol' | 'rose';

interface BandSpec {
  highpass: number;
  lowpass: number;
  /** Presence boost (dB) around 1.8 kHz for intelligibility. */
  presence: number;
  /** Waveshaper drive; 0 = clean. */
  drive: number;
  /** Background hiss level while transmitting. */
  hiss: number;
  /** Random crackle pops per second. */
  crackle: number;
  /** Lowpass warble depth (Hz) for worn-out sets. */
  warble: number;
  gain: number;
}

const BANDS: Record<RadioBand, BandSpec> = {
  kestrel: { highpass: 300, lowpass: 3600, presence: 4, drive: 1.6, hiss: 0.012, crackle: 0, warble: 0, gain: 1 },
  wake: { highpass: 420, lowpass: 2700, presence: 6, drive: 5, hiss: 0.022, crackle: 5, warble: 0, gain: 0.55 },
  combine: { highpass: 140, lowpass: 7500, presence: 2, drive: 0, hiss: 0, crackle: 0, warble: 0, gain: 1.4 },
  drift: { highpass: 360, lowpass: 3000, presence: 5, drive: 2.2, hiss: 0.02, crackle: 1.5, warble: 450, gain: 0.85 },
  patrol: { highpass: 220, lowpass: 5200, presence: 5, drive: 0.8, hiss: 0.004, crackle: 0, warble: 0, gain: 1.15 },
  rose: { highpass: 180, lowpass: 4600, presence: 3, drive: 1.1, hiss: 0.01, crackle: 2.5, warble: 90, gain: 1.05 },
};

const shapers = new Map<number, Float32Array<ArrayBuffer>>();
function shaperCurve(drive: number): Float32Array<ArrayBuffer> {
  let curve = shapers.get(drive);
  if (!curve) {
    curve = new Float32Array(1024);
    const norm = Math.tanh(drive);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(drive * x) / norm;
    }
    shapers.set(drive, curve);
  }
  return curve;
}

/** One transmission in progress. Can be paused and resumed (with the game) or cut off. */
export class RadioClip {
  private source: AudioBufferSourceNode | null = null;
  private hissSource: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private offset = 0;
  private done = false;
  /** Fires once, when the clip plays out or is stopped. */
  onEnded: (() => void) | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly buffer: AudioBuffer,
    private readonly input: AudioNode,
    private readonly hissIn: AudioNode,
    private readonly noise: AudioBuffer,
  ) {}

  get duration(): number {
    return this.buffer.duration;
  }

  play(): void {
    if (this.done || this.source) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.input);
    src.onended = () => {
      if (this.source !== src) return; // stopped by pause()
      this.source = null;
      this.finish();
    };
    this.startedAt = this.ctx.currentTime - this.offset;
    src.start(0, this.offset);
    this.source = src;
    const hiss = this.ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    hiss.connect(this.hissIn);
    hiss.start(0, Math.random() * 1.5);
    this.hissSource = hiss;
  }

  pause(): void {
    if (!this.source) return;
    this.offset = Math.min(this.ctx.currentTime - this.startedAt, this.buffer.duration);
    const src = this.source;
    this.source = null;
    src.stop();
    this.stopHiss();
  }

  stop(): void {
    this.pause();
    this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.stopHiss();
    this.onEnded?.();
  }

  private stopHiss(): void {
    this.hissSource?.stop();
    this.hissSource = null;
  }
}

export class Radio {
  private readonly bus: GainNode;
  private readonly clips = new Map<string, Promise<AudioBuffer | null>>();
  private ducking = 0;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly noise: AudioBuffer,
    /** Called with 0..1 so the mixer can dip the music under speech. */
    private readonly duck: (amount: number) => void,
  ) {
    this.bus = ctx.createGain();
    this.bus.connect(destination);
  }

  setVolume(v: number): void {
    this.bus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Fetches and decodes a clip once; resolves null if it is missing or undecodable. */
  load(url: string): Promise<AudioBuffer | null> {
    let p = this.clips.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((data) => this.ctx.decodeAudioData(data))
        .catch(() => null);
      this.clips.set(url, p);
    }
    return p;
  }

  /** Builds the band's transmitter chain and returns a clip ready to play. */
  transmit(buffer: AudioBuffer, band: RadioBand, onEnded?: () => void): RadioClip {
    const ctx = this.ctx;
    const b = BANDS[band];
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = b.highpass;
    hp.Q.value = 0.8;
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 1800;
    presence.Q.value = 0.9;
    presence.gain.value = b.presence;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = b.lowpass;
    lp.Q.value = 0.9;
    const out = ctx.createGain();
    out.gain.value = b.gain;
    hp.connect(presence);
    let node: AudioNode = presence;
    if (b.drive > 0) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = shaperCurve(b.drive);
      shaper.oversample = '2x';
      node.connect(shaper);
      node = shaper;
    }
    node.connect(lp).connect(out).connect(this.bus);

    let warbleOsc: OscillatorNode | null = null;
    if (b.warble > 0) {
      warbleOsc = ctx.createOscillator();
      warbleOsc.frequency.value = 5.3;
      const depth = ctx.createGain();
      depth.gain.value = b.warble;
      warbleOsc.connect(depth).connect(lp.frequency);
      warbleOsc.start();
    }

    // background hiss and crackle, shaped like the band
    const hissBp = ctx.createBiquadFilter();
    hissBp.type = 'bandpass';
    hissBp.frequency.value = Math.sqrt(b.highpass * b.lowpass);
    hissBp.Q.value = 0.6;
    const hissGain = ctx.createGain();
    hissGain.gain.value = b.hiss;
    if (b.crackle > 0) {
      const t0 = ctx.currentTime;
      const span = buffer.duration + 0.2;
      for (let i = 0; i < b.crackle * span; i++) {
        const t = t0 + Math.random() * span;
        hissGain.gain.setValueAtTime(b.hiss + 0.12 + Math.random() * 0.12, t);
        hissGain.gain.setValueAtTime(b.hiss, t + 0.008 + Math.random() * 0.02);
      }
    }
    hissBp.connect(hissGain).connect(this.bus);

    const clip = new RadioClip(ctx, buffer, hp, hissBp, this.noise);
    this.setDuck(1);
    clip.onEnded = () => {
      this.squelch(band);
      this.setDuck(-1);
      warbleOsc?.stop();
      window.setTimeout(() => {
        out.disconnect();
        hissGain.disconnect();
      }, 400);
      onEnded?.();
    };
    return clip;
  }

  /** Opening call tone: each faction's sets announce themselves differently. */
  chirp(band: RadioBand): void {
    const t = this.ctx.currentTime;
    switch (band) {
      case 'kestrel':
        this.tone('sine', 1320, t, 0.06, 0.12);
        this.tone('sine', 1760, t + 0.07, 0.06, 0.1);
        break;
      case 'wake':
        this.tone('square', 420, t, 0.07, 0.06);
        this.tone('square', 300, t + 0.08, 0.09, 0.06);
        this.burst(t, 0.12, 0.18, 1400);
        break;
      case 'combine':
        this.tone('sine', 1568, t, 0.14, 0.08);
        this.tone('sine', 2093, t + 0.09, 0.2, 0.07);
        break;
      case 'drift':
        this.burst(t, 0.04, 0.3, 2200);
        this.tone('triangle', 990, t + 0.05, 0.1, 0.1);
        break;
      case 'rose':
        this.tone('sine', 784, t, 0.07, 0.08);
        this.tone('sine', 1047, t + 0.08, 0.07, 0.08);
        this.tone('sine', 1319, t + 0.16, 0.12, 0.07);
        break;
      case 'patrol':
        this.tone('square', 1175, t, 0.05, 0.05);
        this.tone('square', 880, t + 0.06, 0.05, 0.05);
        this.tone('square', 1175, t + 0.12, 0.05, 0.05);
        break;
    }
  }

  /** Release burst ("kssht") when a transmission ends; Combine sets cut cleanly. */
  private squelch(band: RadioBand): void {
    if (band === 'combine') return;
    this.burst(this.ctx.currentTime, band === 'wake' ? 0.16 : 0.1, band === 'wake' ? 0.2 : 0.12, 2400);
  }

  private tone(type: OscillatorType, freq: number, t: number, dur: number, vol: number): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(t: number, dur: number, vol: number, freq: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.bus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  private setDuck(delta: number): void {
    this.ducking = Math.max(0, this.ducking + delta);
    this.duck(this.ducking > 0 ? 1 : 0);
  }
}
