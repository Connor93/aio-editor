// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh
// Core shapes + effect definition. Framework-agnostic (Canvas2D + plain TS
// only) so this module can be vendored verbatim into another repository.

import type { Ramp } from './palette';

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
  ramp: Ramp; // shadow/mid/base/hot — was: color: number
  sizeScale: number; // 0.6 sm / 1.0 base / 1.5 lg
  durationMs: number;
  additive: boolean;
  frames: number; // discrete frames eoweb rasterizes (e.g. 12)
  combo?: ShapeKind; // optional second kind composited on top
}

// ── Pixel pipeline sizing ───────────────────────────────────────────────
// Three distinct sizes, not interchangeable:
//
//   DESIGN_SIZE   the coordinate space every KINDS[kind].draw function
//                 writes in. Every geometry constant inside kinds.ts (radii,
//                 lengths, stroke widths, particle counts) is tuned to a
//                 worst-case Chebyshev extent budget in THIS space and must
//                 never be hand-edited — reaching a different raster
//                 resolution is done with ctx.scale, not by touching draw
//                 functions.
//
//   INTERNAL_SIZE the actual raster resolution: draw functions are rendered
//                 into an INTERNAL_SIZE square (via ctx.scale(INTERNAL_SIZE /
//                 DESIGN_SIZE)) and quantised onto the ramp AT this
//                 resolution, so each ramp band lands on whole pixels before
//                 any upscaling happens.
//
//   PIXEL_SCALE   the integer factor the internal raster is upscaled by
//                 (nearest-neighbour, imageSmoothingEnabled = false) to reach
//                 the output frame. Must be a positive integer: a fractional
//                 upscale ratio produces pixels of uneven size (some 3
//                 screen-px wide, some 4), which reads as a rendering fault
//                 rather than as pixel art.
//
//   FRAME_SIZE    INTERNAL_SIZE * PIXEL_SCALE — the output frame every
//                 consumer (eoweb's rasterized textures, the editor's live
//                 canvas) actually sees. Was 128; now 132, since 128 doesn't
//                 factor into an integer multiple of a sensible INTERNAL_SIZE.
export const DESIGN_SIZE = 128;
export const INTERNAL_SIZE = 44;
export const PIXEL_SCALE = 3;
export const FRAME_SIZE = INTERNAL_SIZE * PIXEL_SCALE;
