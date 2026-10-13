import * as THREE from 'three';
import { clamp, rand } from './math';
import { Radio } from './radio';

export type LaserKind = 'player' | 'enemy' | 'ally' | 'heavy' | 'rapid' | 'cannon' | 'scatter';

const _rel = new THREE.Vector3();
const midi = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

interface Voice {
  input: GainNode;
  pan: StereoPannerNode;
}

/**
 * Fully synthesised audio: the only samples are the recorded radio lines (see Radio). Positional
 * sounds use distance gain, a distance lowpass and stereo pan relative to the listener's orientation.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private readonly listenerPos = new THREE.Vector3();
  private readonly listenerInv = new THREE.Quaternion();
  private activeVoices = 0;

  // continuous layers
  private engFilter!: BiquadFilterNode;
  private engGain!: GainNode;
  private engOsc1!: OscillatorNode;
  private engOsc2!: OscillatorNode;
  private thrustFilter!: BiquadFilterNode;
  private thrustGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private windPan!: StereoPannerNode;
  private toneOsc!: OscillatorNode;
  private toneGain!: GainNode;

  private lockState: 'none' | 'locking' | 'locked' = 'none';
  private lockTimer = 0;
  private warnLevel = 0;
  private warnTimer = 0;
  private warnAlt = false;

  readonly music = new MusicSequencer(this);
  musicVolume = 0.32;
  sfxVolume = 0.9;
  voiceVolume = 1;
  /** Radio dialogue playback; null until the audio context exists. */
  radio: Radio | null = null;
  private musicDuck = 1;

  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVolume;
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.radio = new Radio(ctx, this.master, this.noise, (amount) => {
      // dip the music under speech, recover slowly afterwards
      this.musicDuck = 1 - amount * 0.55;
      this.musicBus.gain.setTargetAtTime(this.musicVolume * this.musicDuck, ctx.currentTime, amount ? 0.12 : 0.8);
    });
    this.radio.setVolume(this.voiceVolume);

    // engine drone
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engFilter.Q.value = 4;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engOsc1 = ctx.createOscillator();
    this.engOsc1.type = 'sawtooth';
    this.engOsc1.frequency.value = 48;
    this.engOsc2 = ctx.createOscillator();
    this.engOsc2.type = 'square';
    this.engOsc2.frequency.value = 48.6;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.4;
    this.engOsc1.connect(this.engFilter);
    this.engOsc2.connect(o2g).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.sfx);
    this.engOsc1.start();
    this.engOsc2.start();

    // thrust hiss
    const thrustSrc = this.loopNoise();
    this.thrustFilter = ctx.createBiquadFilter();
    this.thrustFilter.type = 'bandpass';
    this.thrustFilter.frequency.value = 800;
    this.thrustFilter.Q.value = 0.7;
    this.thrustGain = ctx.createGain();
    this.thrustGain.gain.value = 0;
    thrustSrc.connect(this.thrustFilter).connect(this.thrustGain).connect(this.sfx);

    // proximity wind: rises as you skim structures at speed
    const windSrc = this.loopNoise();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 1.2;
    this.windFilter.frequency.value = 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windPan = ctx.createStereoPanner();
    windSrc.connect(this.windFilter).connect(this.windGain).connect(this.windPan).connect(this.sfx);

    // lock / warning tone
    this.toneOsc = ctx.createOscillator();
    this.toneOsc.type = 'square';
    this.toneOsc.frequency.value = 1000;
    this.toneGain = ctx.createGain();
    this.toneGain.gain.value = 0;
    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = 3000;
    this.toneOsc.connect(toneFilter).connect(this.toneGain).connect(this.sfx);
    this.toneOsc.start();
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  get context(): AudioContext {
    if (!this.ctx) throw new Error('audio not initialised');
    return this.ctx;
  }

  get musicOut(): GainNode {
    return this.musicBus;
  }

  get noiseBuffer(): AudioBuffer {
    return this.noise;
  }

  setVolumes(sfx: number, music: number, voice = this.voiceVolume): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    this.voiceVolume = voice;
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(music * this.musicDuck, this.ctx.currentTime, 0.05);
    this.radio?.setVolume(voice);
  }

  private loopNoise(): AudioBufferSourceNode {
    const ctx = this.context;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(0, Math.random() * 1.5);
    return src;
  }

  setListener(pos: THREE.Vector3, quat: THREE.Quaternion): void {
    this.listenerPos.copy(pos);
    this.listenerInv.copy(quat).invert();
  }

  /** Allocates a positional voice; returns null when inaudible or the voice cap is hit. */
  private voice(pos: THREE.Vector3 | null, volume: number, duration: number, rolloff = 90): Voice | null {
    const ctx = this.ctx;
    if (!ctx || this.activeVoices > 32) return null;
    let gain = volume;
    let pan = 0;
    let cutoff = 18000;
    if (pos) {
      _rel.subVectors(pos, this.listenerPos);
      const dist = _rel.length();
      gain *= 1 / (1 + dist / rolloff);
      if (gain < 0.004) return null;
      _rel.applyQuaternion(this.listenerInv);
      pan = clamp(_rel.x / (dist + 10), -1, 1) * 0.85;
      cutoff = 18000 / (1 + dist / 250);
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = Math.max(cutoff, 400);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(f).connect(p).connect(this.sfx);
    this.activeVoices++;
    window.setTimeout(
      () => {
        this.activeVoices--;
        p.disconnect();
      },
      (duration + 0.1) * 1000,
    );
    return { input: g, pan: p };
  }

  private env(t: number, attack: number, decay: number, peak = 1): GainNode {
    const g = this.context.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private noiseSource(t: number, duration: number, rate = 1): AudioBufferSourceNode {
    const src = this.context.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    src.start(t, Math.random() * 1.2);
    src.stop(t + duration);
    return src;
  }

  laser(pos: THREE.Vector3 | null, kind: LaserKind): void {
    const presets = {
      player: { f0: 1500, f1: 170, vol: 0.2, dur: 0.16, type: 'sawtooth' as OscillatorType },
      enemy: { f0: 950, f1: 90, vol: 0.32, dur: 0.18, type: 'sawtooth' as OscillatorType },
      ally: { f0: 2100, f1: 320, vol: 0.26, dur: 0.14, type: 'square' as OscillatorType },
      heavy: { f0: 520, f1: 60, vol: 0.4, dur: 0.24, type: 'sawtooth' as OscillatorType },
      rapid: { f0: 2400, f1: 600, vol: 0.13, dur: 0.08, type: 'square' as OscillatorType },
      cannon: { f0: 380, f1: 38, vol: 0.42, dur: 0.34, type: 'sawtooth' as OscillatorType },
      scatter: { f0: 900, f1: 120, vol: 0.3, dur: 0.2, type: 'square' as OscillatorType },
    }[kind];
    const v = this.voice(pos, presets.vol, presets.dur + 0.05);
    if (!v) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const f0 = presets.f0 * rand(0.94, 1.06);
    const e = this.env(t, 0.003, presets.dur);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(6000, t);
    filt.frequency.exponentialRampToValueAtTime(700, t + presets.dur);
    for (const [mult, type] of [
      [1, presets.type],
      [0.5, 'square'],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0 * mult, t);
      o.frequency.exponentialRampToValueAtTime(presets.f1 * mult, t + presets.dur);
      o.connect(filt);
      o.start(t);
      o.stop(t + presets.dur + 0.02);
    }
    filt.connect(e).connect(v.input);
    if (kind === 'cannon' || kind === 'scatter') {
      // a noise crack on top for the heavy guns
      const n = this.noiseSource(t, 0.15, 0.7);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      n.connect(hp).connect(this.env(t, 0.002, 0.12, 0.7)).connect(v.input);
    }
  }

  /** Catapult launch: a deep clunk and a rising rush. */
  catapult(pos: THREE.Vector3 | null): void {
    const v = this.voice(pos, pos ? 0.8 : 0.6, 1.6, 140);
    if (!v) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(90, t);
    thump.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    thump.connect(this.env(t, 0.003, 0.45, 1.3)).connect(v.input);
    thump.start(t);
    thump.stop(t + 0.5);
    const n = this.noiseSource(t, 1.4, 0.8);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(220, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 1.1);
    n.connect(bp).connect(this.env(t, 0.08, 1.2, 0.9)).connect(v.input);
  }

  /** Flare pop: a bright crackle and hiss. */
  flare(): void {
    const v = this.voice(null, 0.35, 0.6);
    if (!v) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const n = this.noiseSource(t, 0.5, 1.4);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(4200, t);
    bp.frequency.exponentialRampToValueAtTime(1200, t + 0.5);
    n.connect(bp).connect(this.env(t, 0.003, 0.45)).connect(v.input);
    this.blip(1900, 0.06, 0.04);
  }

  explosion(pos: THREE.Vector3 | null, size = 1): void {
    const dur = 1.2 + size * 0.8;
    const v = this.voice(pos, 0.9 * Math.min(size, 2), dur + 0.2, 160);
    if (!v) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const n = this.noiseSource(t, dur, rand(0.5, 0.8));
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + dur);
    n.connect(lp).connect(this.env(t, 0.004, dur)).connect(v.input);
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, t);
    thump.frequency.exponentialRampToValueAtTime(32, t + 0.6);
    thump.connect(this.env(t, 0.004, 0.7, 1.4)).connect(v.input);
    thump.start(t);
    thump.stop(t + 0.8);
    // crackle tail
    for (let i = 0; i < 4; i++) {
      const tt = t + 0.1 + Math.random() * 0.6;
      const c = this.noiseSource(tt, 0.06, 1.5);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2500;
      c.connect(hp).connect(this.env(tt, 0.002, 0.05, 0.35)).connect(v.input);
    }
  }

  shieldHit(): void {
    const v = this.voice(null, 0.35, 0.3);
    if (!v) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const n = this.noiseSource(t, 0.15);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 2;
    n.connect(bp).connect(this.env(t, 0.002, 0.12)).connect(v.input);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1900, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.2);
    o.connect(this.env(t, 0.002, 0.2, 0.4)).connect(v.input);
    o.start(t);
    o.stop(t + 0.25);
  }

  hullHit(): void {
    const v = this.voice(null, 0.55, 0.4);
    if (!v) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const n = this.noiseSource(t, 0.3, 0.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    n.connect(lp).connect(this.env(t, 0.002, 0.25)).connect(v.input);
    for (const f of [140, 213, 331]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(this.env(t, 0.002, 0.3, 0.12)).connect(v.input);
      o.start(t);
      o.stop(t + 0.35);
    }
  }

  /** Grinding impact against station geometry. */
  scrape(intensity: number): void {
    const v = this.voice(null, clamp(0.25 + intensity * 0.6, 0, 0.9), 0.8);
    if (!v) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const n = this.noiseSource(t, 0.5, 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    n.connect(lp).connect(this.env(t, 0.003, 0.45)).connect(v.input);
    for (const f of [180, 263, 391, 527]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * rand(0.97, 1.03);
      o.connect(this.env(t, 0.002, 0.7, 0.15)).connect(v.input);
      o.start(t);
      o.stop(t + 0.75);
    }
  }

  missileLaunch(pos: THREE.Vector3 | null): void {
    const v = this.voice(pos, 0.5, 0.9);
    if (!v) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const n = this.noiseSource(t, 0.8);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.6);
    n.connect(bp).connect(this.env(t, 0.02, 0.75)).connect(v.input);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.5);
    o.connect(this.env(t, 0.01, 0.5, 0.25)).connect(v.input);
    o.start(t);
    o.stop(t + 0.6);
  }

  /** Doppler-ish whoosh as something passes close by. `side` is -1 (left) to 1 (right). */
  whoosh(pos: THREE.Vector3, intensity: number): void {
    const v = this.voice(pos, clamp(intensity, 0.1, 0.8), 0.8, 60);
    if (!v) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const n = this.noiseSource(t, 0.7);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(2800, t);
    bp.frequency.exponentialRampToValueAtTime(260, t + 0.6);
    n.connect(bp).connect(this.env(t, 0.08, 0.55)).connect(v.input);
    const start = v.pan.pan.value;
    v.pan.pan.setValueAtTime(start, t);
    v.pan.pan.linearRampToValueAtTime(-start * 0.8, t + 0.6);
  }

  blip(freq = 880, vol = 0.15, dur = 0.08): void {
    const v = this.voice(null, vol, dur + 0.05);
    if (!v) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(this.env(t, 0.004, dur)).connect(v.input);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  jumpIn(pos: THREE.Vector3): void {
    const v = this.voice(pos, 0.7, 1.4, 250);
    if (!v) return;
    const ctx = this.context;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1800, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 1.0);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    o.connect(lp).connect(this.env(t, 0.01, 1.1, 0.5)).connect(v.input);
    o.start(t);
    o.stop(t + 1.2);
    const n = this.noiseSource(t, 1.0, 0.5);
    n.connect(this.env(t, 0.005, 0.9, 0.6)).connect(v.input);
  }

  setLock(state: 'none' | 'locking' | 'locked'): void {
    this.lockState = state;
  }

  setMissileWarning(level: number): void {
    this.warnLevel = level;
  }

  /** Per-frame update of continuous layers. All inputs 0..1 except `windPan` (-1..1). */
  update(
    dt: number,
    s: { speed: number; thrust: number; boost: boolean; proximity: number; windPan: number; active: boolean },
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const on = s.active ? 1 : 0;
    this.engOsc1.frequency.setTargetAtTime(40 + s.speed * 50 + (s.boost ? 25 : 0), t, 0.1);
    this.engOsc2.frequency.setTargetAtTime(40.6 + s.speed * 51 + (s.boost ? 26 : 0), t, 0.1);
    this.engFilter.frequency.setTargetAtTime(250 + s.thrust * 900 + (s.boost ? 1400 : 0), t, 0.08);
    this.engGain.gain.setTargetAtTime(on * (0.06 + s.thrust * 0.05), t, 0.1);
    this.thrustFilter.frequency.setTargetAtTime(500 + s.thrust * 1500 + (s.boost ? 2500 : 0), t, 0.1);
    this.thrustGain.gain.setTargetAtTime(on * (s.thrust * 0.05 + (s.boost ? 0.16 : 0)), t, 0.08);
    const prox = clamp(s.proximity, 0, 1);
    this.windGain.gain.setTargetAtTime(on * Math.pow(prox, 1.4) * 0.55, t, 0.05);
    this.windFilter.frequency.setTargetAtTime(400 + prox * 2600, t, 0.05);
    this.windPan.pan.setTargetAtTime(clamp(s.windPan, -1, 1) * 0.8, t, 0.05);

    // warning beeps take priority over lock tones
    let toneTarget = 0;
    if (this.warnLevel > 0.01 && s.active) {
      this.warnTimer -= dt;
      if (this.warnTimer <= 0) {
        this.warnAlt = !this.warnAlt;
        this.toneOsc.frequency.setValueAtTime(this.warnAlt ? 1250 : 1650, t);
        this.toneGain.gain.setValueAtTime(0.09, t);
        this.toneGain.gain.setValueAtTime(0, t + 0.06);
        this.warnTimer = 0.45 - this.warnLevel * 0.37;
      }
      return;
    }
    if (this.lockState === 'locking' && s.active) {
      this.lockTimer -= dt;
      if (this.lockTimer <= 0) {
        this.toneOsc.frequency.setValueAtTime(900, t);
        this.toneGain.gain.setValueAtTime(0.03, t);
        this.toneGain.gain.setValueAtTime(0, t + 0.04);
        this.lockTimer = 0.14;
      }
      return;
    }
    if (this.lockState === 'locked' && s.active) {
      this.toneOsc.frequency.setTargetAtTime(1400, t, 0.01);
      toneTarget = 0.024;
    }
    this.toneGain.gain.setTargetAtTime(toneTarget, t, 0.02);
  }

  silenceLoops(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(0, t, 0.05);
    this.thrustGain.gain.setTargetAtTime(0, t, 0.05);
    this.windGain.gain.setTargetAtTime(0, t, 0.05);
    this.toneGain.gain.setTargetAtTime(0, t, 0.02);
  }
}

/**
 * Generative synthwave score in A minor. `intensity` (0..1) layers in drums and arpeggios as
 * combat heats up.
 */
export class MusicSequencer {
  intensity = 0.2;
  enabled = true;
  private timer: number | null = null;
  private step = 0;
  private bar = 0;
  private nextTime = 0;
  private delay: DelayNode | null = null;
  private readonly tempo = 116;

  private readonly progA = [
    { bass: 45, chord: [57, 60, 64] },
    { bass: 41, chord: [57, 60, 65] },
    { bass: 48, chord: [55, 60, 64] },
    { bass: 43, chord: [55, 59, 62] },
  ];
  private readonly progB = [
    { bass: 45, chord: [57, 60, 64] },
    { bass: 43, chord: [55, 59, 62] },
    { bass: 41, chord: [53, 57, 60] },
    { bass: 40, chord: [56, 59, 64] },
  ];

  constructor(private readonly audio: AudioEngine) {}

  start(): void {
    if (this.timer !== null || !this.audio.ready) return;
    const ctx = this.audio.context;
    if (!this.delay) {
      this.delay = ctx.createDelay(1);
      this.delay.delayTime.value = (60 / this.tempo) * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      this.delay.connect(fb).connect(this.delay);
      this.delay.connect(wet).connect(this.audio.musicOut);
    }
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (!this.enabled) return;
    const ctx = this.audio.context;
    const stepDur = 60 / this.tempo / 4;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  private playStep(step: number, t: number, sd: number): void {
    const prog = Math.floor(this.bar / 8) % 2 === 0 ? this.progA : this.progB;
    const cur = prog[this.bar % 4];
    const I = this.intensity;
    if (step === 0) this.pad(cur.chord, t, sd * 16);
    if (step % 2 === 0) {
      const pattern = [0, 0, 12, 0, 0, 12, 7, 12];
      this.bass(cur.bass + pattern[(step / 2) % 8] - 12, t, sd * 1.8, 300 + I * 1400);
    }
    if (I > 0.35) {
      if (step % 4 === 0) this.kick(t);
      if (step === 4 || step === 12) this.snare(t);
      if (I > 0.5) this.hat(t, step % 4 === 2 ? 0.07 : 0.035);
    }
    if (I > 0.6) {
      const arp = [0, 1, 2, 1, 0, 2, 1, 2];
      const note = cur.chord[arp[step % 8]] + (step >= 8 ? 12 : 0);
      this.lead(note, t, sd * 0.9);
    }
  }

  private out(gain: number): GainNode {
    const g = this.audio.context.createGain();
    g.gain.value = gain;
    g.connect(this.audio.musicOut);
    return g;
  }

  private pad(chord: number[], t: number, dur: number): void {
    const ctx = this.audio.context;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900 + this.intensity * 900;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.09, t + 0.8);
    env.gain.setValueAtTime(0.09, t + dur - 0.5);
    env.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
    lp.connect(env).connect(this.out(1));
    for (const n of chord) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.4);
      }
    }
  }

  private bass(note: number, t: number, dur: number, cutoff: number): void {
    const ctx = this.audio.context;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midi(note);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(cutoff * 2, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(cutoff * 0.3, 80), t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.22, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(env).connect(this.out(1));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private lead(note: number, t: number, dur: number): void {
    const ctx = this.audio.context;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = midi(note);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.05, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    o.connect(lp).connect(env);
    env.connect(this.out(1));
    if (this.delay) env.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number): void {
    const ctx = this.audio.context;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(env).connect(this.out(1));
    o.start(t);
    o.stop(t + 0.32);
  }

  private snare(t: number): void {
    const ctx = this.audio.context;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.22, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(bp).connect(env).connect(this.out(1));
    src.start(t, Math.random());
    src.stop(t + 0.2);
  }

  private hat(t: number, vol: number): void {
    const ctx = this.audio.context;
    const src = ctx.createBufferSource();
    src.buffer = this.audio.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(vol, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(hp).connect(env).connect(this.out(1));
    src.start(t, Math.random());
    src.stop(t + 0.06);
  }
}
