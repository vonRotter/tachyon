import type * as THREE from 'three';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityProfile {
  level: QualityLevel;
  /** Upper bound on the device pixel ratio used for rendering. */
  pixelRatioCap: number;
  /** MSAA samples on the post-processing target (0 = off). */
  msaa: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Half-width in metres of the shadow box that follows the player. */
  shadowRange: number;
  /** Procedural hull detail (panels, grime, windows). */
  surfaceDetail: boolean;
  lensFlare: boolean;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: {
    level: 'low',
    pixelRatioCap: 1,
    msaa: 0,
    shadows: false,
    shadowMapSize: 1024,
    shadowRange: 300,
    surfaceDetail: false,
    lensFlare: false,
  },
  medium: {
    level: 'medium',
    pixelRatioCap: 1.25,
    msaa: 4,
    shadows: true,
    shadowMapSize: 2048,
    shadowRange: 450,
    surfaceDetail: true,
    lensFlare: true,
  },
  high: {
    level: 'high',
    pixelRatioCap: 1.5,
    msaa: 4,
    shadows: true,
    shadowMapSize: 4096,
    shadowRange: 700,
    surfaceDetail: true,
    lensFlare: true,
  },
};

/**
 * Picks a starting preset from the GPU name. It is only a guess: integrated GPUs get Medium,
 * dedicated ones High, software renderers Low. Players can override it in settings, and dynamic
 * resolution covers the rest.
 */
export function detectQuality(renderer: THREE.WebGLRenderer): QualityLevel {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    if (/swiftshader|llvmpipe|softpipe|software/.test(name)) return 'low';
    if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|apple m\d (pro|max|ultra)|arc a\d/.test(name)) return 'high';
    return 'medium';
  } catch {
    return 'medium';
  }
}

/**
 * Lowers render resolution when frames run long and raises it again when there is headroom.
 * Changes are rate-limited because resizing render targets is not free.
 */
export class DynamicResolution {
  scale = 1;
  private accum = 0;
  private frames = 0;
  private cooldown = 0;
  enabled = true;

  constructor(
    private readonly min = 0.6,
    private readonly target = 1 / 58,
  ) {}

  /** Returns true when the scale changed. */
  update(frameSeconds: number): boolean {
    if (!this.enabled) return false;
    this.accum += Math.min(frameSeconds, 0.1);
    this.frames++;
    this.cooldown -= frameSeconds;
    if (this.accum < 1 || this.cooldown > 0) return false;
    const avg = this.accum / this.frames;
    this.accum = 0;
    this.frames = 0;
    let next = this.scale;
    if (avg > this.target * 1.12) next = Math.max(this.min, this.scale - 0.1);
    else if (avg < this.target * 0.8) next = Math.min(1, this.scale + 0.05);
    if (next !== this.scale) {
      this.scale = next;
      this.cooldown = 1.5;
      return true;
    }
    return false;
  }
}
