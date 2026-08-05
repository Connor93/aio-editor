// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh
// Core shapes + effect definition. Framework-agnostic (Canvas2D + plain TS
// only) so this module can be vendored verbatim into another repository.

export type ShapeKind =
  | 'ring'
  | 'disc'
  | 'spark-burst'
  | 'slash'
  | 'spiral'
  | 'sparkle'
  | 'nova'
  | 'shockwave'
  | 'beam-pop'
  | 'implode'
  | 'vortex'
  | 'rain'
  | 'chains'
  | 'orbit'
  | 'burst-lines';

export interface VfxDef {
  kind: ShapeKind;
  color: number; // 0xRRGGBB
  sizeScale: number; // 0.6 sm / 1.0 base / 1.5 lg
  durationMs: number;
  additive: boolean;
  frames: number; // discrete frames eoweb rasterizes (e.g. 12)
  combo?: ShapeKind; // optional second kind composited on top
}

// Fixed working canvas size (px) that every frame is rasterized into.
export const FRAME_SIZE = 128;
