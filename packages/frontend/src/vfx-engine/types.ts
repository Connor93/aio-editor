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
  | 'burst-lines'
  // Set pieces (registry.ts's `setpiece` layer): element-only, size-less.
  // Live in the same KINDS table as the 15 above — their draw functions are
  // ordinary draw functions — but MUST NOT be added to MATRIX_KINDS in
  // registry.ts, or each one would silently gain 21 matrix names (7
  // elements x 3 sizes) it was never meant to have.
  | 'bolt'
  | 'smite'
  | 'rockfall'
  | 'ring-of-fire';

// The three depth passes an effect can paint into, relative to the
// character sprite: 'behind' composites under them, 'tint' blends onto them
// (e.g. a multiply/screen wash), 'front' composites over them — the usual
// decal layer every effect had before this type existed. NOT the same axis
// as `VfxLayer` in registry.ts ('matrix' | 'combo' | 'special'), which
// classifies how a name was generated, not where it paints. Do not conflate
// the two or rename either.
export type DepthLayer = 'behind' | 'tint' | 'front';
export const DEPTH_LAYERS: readonly DepthLayer[] = ['behind', 'tint', 'front'];

export interface VfxDef {
  kind: ShapeKind;
  ramp: Ramp; // shadow/mid/base/hot — was: color: number
  sizeScale: number; // 0.6 sm / 1.0 base / 1.5 lg
  additive: boolean;
  frames: number; // discrete frames in ONE cycle (default 4)
  loops: number; // cycle repeats (per-effect; EO spans 1-8)
  frameMs: number; // hold time per frame, ms (default 100)
  combo?: ShapeKind; // optional second kind composited on top
  frame: FrameGeometry; // NOT optional — see FrameGeometry's doc comment
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

// ── Per-def frame geometry ──────────────────────────────────────────────
// Every effect used to paint into ONE global square frame (DESIGN_SIZE ->
// INTERNAL_SIZE -> FRAME_SIZE above), which means nothing could ever arrive
// from off that square — no falling boulder, no descending lightning bolt.
// FrameGeometry makes the frame a per-def property instead of three module
// constants, so a def can opt into a taller box with headroom above the
// target while every effect that existed before this type keeps the exact
// old numbers under a new name.

/** A def's frame: the draw-space box, where its ground point sits inside that
 *  box, and the derived raster/output sizes.
 *
 *  `designW`/`designH` are the coordinate space draw functions write in —
 *  DESIGN_SIZE stays the WIDTH unit, and a tall frame only grows downward-to-
 *  upward headroom. `groundY` is what draw functions receive as `cy`: the
 *  point that lines up with the target's feet. For a square frame that is the
 *  centre (unchanged); for a tall frame it sits three-quarters down, so the
 *  extra height is all headroom ABOVE the target for something to fall from. */
export interface FrameGeometry {
  designW: number;
  designH: number;
  groundY: number;
  internalW: number;
  internalH: number;
  outW: number;
  outH: number;
  anchorY: number;
}

/** Derives raster + output sizes from a draw-space box. The integer-upscale
 *  rule applies PER AXIS — a fractional ratio on either produces pixels of
 *  uneven size. Pick design dimensions that are whole multiples of
 *  DESIGN_SIZE/INTERNAL_SIZE (i.e. multiples of 32) so both axes stay exact. */
function makeFrame(
  designW: number,
  designH: number,
  groundY: number,
): FrameGeometry {
  const k = INTERNAL_SIZE / DESIGN_SIZE;
  const internalW = Math.round(designW * k);
  const internalH = Math.round(designH * k);
  return {
    designW,
    designH,
    groundY,
    internalW,
    internalH,
    outW: internalW * PIXEL_SCALE,
    outH: internalH * PIXEL_SCALE,
    anchorY: groundY / designH,
  };
}

/** Every effect that existed before set pieces. 128x128 design -> 44x44 raster
 *  -> 132x132 output, ground point dead centre. Identical to the old globals. */
export const SQUARE_FRAME: FrameGeometry = makeFrame(128, 128, 64);

/** Descents. 128x256 design -> 44x88 raster -> 132x264 output. The ground
 *  point is at y=192, so the bottom 128 design-px occupy exactly where a
 *  square frame would sit and the top 128 are headroom. anchorY = 0.75. */
export const TALL_FRAME: FrameGeometry = makeFrame(128, 256, 192);
