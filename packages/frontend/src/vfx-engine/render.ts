// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh
// Canvas2D dispatchers: rasterize a single frame to an offscreen canvas, or
// paint an effect directly onto an existing context at a given progress.
//
// Both paths share the same pixel pipeline: raster small (INTERNAL_SIZE) in
// the draw functions' native DESIGN_SIZE coordinate space, quantise every
// painted pixel onto the def's 4-rung ramp WHILE STILL at raster resolution
// (so the ramp bands land on whole pixels), then upscale by the integer
// PIXEL_SCALE with smoothing off. Quantising after the upscale would resample
// the hard bands back into gradients and defeat the point.

import { KINDS } from './kinds';
import type { Ramp } from './palette';
import { DESIGN_SIZE, FRAME_SIZE, INTERNAL_SIZE, type VfxDef } from './types';

/** Snap every painted pixel onto the def's 4-rung ramp, using its own perceived
 *  brightness weighted by coverage as the index, and write it at full alpha.
 *  Hard steps, no dither: a screen-space dither pattern shimmers when the shape
 *  animates through it (explicitly rejected during design).
 *
 *  Runs on the INTERNAL_SIZE buffer, BEFORE upscaling, so the ramp bands are
 *  whole pixels rather than being resampled into gradients. */
function quantizeToRamp(
  ctx: CanvasRenderingContext2D,
  size: number,
  ramp: Ramp,
): void {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] as number;
    if (a === 0) continue;
    const lum =
      (((0.299 * (d[i] as number) +
        0.587 * (d[i + 1] as number) +
        0.114 * (d[i + 2] as number)) /
        255) *
        a) /
      255;
    let idx = Math.round(lum * ramp.length) - 1;
    if (idx < 0) {
      d[i + 3] = 0;
      continue;
    }
    if (idx >= ramp.length) idx = ramp.length - 1;
    const c = ramp[idx] as number;
    d[i] = (c >> 16) & 0xff;
    d[i + 1] = (c >> 8) & 0xff;
    d[i + 2] = c & 0xff;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export function renderFrameCanvas(
  def: VfxDef,
  frameIndex: number,
): HTMLCanvasElement {
  // 1. Rasterise at INTERNAL_SIZE. Draw functions keep writing in the 128px
  //    DESIGN_SIZE space and ctx.scale does the reduction — their geometry
  //    constants are tuned to that space (Chebyshev extent <= 62px at
  //    sizeScale 1.5) and must NOT be rewritten.
  const small = document.createElement('canvas');
  small.width = INTERNAL_SIZE;
  small.height = INTERNAL_SIZE;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  if (!sctx) {
    throw new Error('vfx-engine: failed to acquire a 2d canvas context');
  }

  const k = INTERNAL_SIZE / DESIGN_SIZE;
  sctx.save();
  sctx.scale(k, k);
  sctx.globalCompositeOperation = def.additive ? 'lighter' : 'source-over';
  // Keep the EXISTING progress formula here — Task 3 replaces it with
  // midpoint sampling. Do not forward-reference frameProgress(); it does not
  // exist yet at this point in the plan.
  const progress = frameIndex / def.frames;
  KINDS[def.kind].draw(sctx, progress, def, DESIGN_SIZE / 2, DESIGN_SIZE / 2);
  if (def.combo) {
    KINDS[def.combo].draw(
      sctx,
      progress,
      def,
      DESIGN_SIZE / 2,
      DESIGN_SIZE / 2,
    );
  }
  sctx.restore();

  // 2. Quantise onto the ramp while still at raster resolution.
  quantizeToRamp(sctx, INTERNAL_SIZE, def.ramp);

  // 3. Upscale by an INTEGER factor with smoothing off. A fractional ratio
  //    produces pixels of uneven size, which reads as a rendering fault.
  const out = document.createElement('canvas');
  out.width = FRAME_SIZE;
  out.height = FRAME_SIZE;
  const octx = out.getContext('2d');
  if (!octx) {
    throw new Error('vfx-engine: failed to acquire a 2d canvas context');
  }
  octx.imageSmoothingEnabled = false;
  octx.drawImage(
    small,
    0,
    0,
    INTERNAL_SIZE,
    INTERNAL_SIZE,
    0,
    0,
    FRAME_SIZE,
    FRAME_SIZE,
  );
  return out;
}

// Reused scratch canvas for drawEffectAt (below) — module-level, NOT
// allocated per call. The editor drives this on a continuous rAF loop, so a
// fresh canvas per frame would churn garbage on a hot path. Created lazily
// (only on first actual draw call) rather than at module scope, so importing
// this module in a headless context (e.g. `pnpm vfx:check`, which imports the
// whole `@/vfx-engine` barrel but never calls draw()/renderFrameCanvas()/
// drawEffectAt()) never touches `document`.
let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
function getScratch(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  if (!scratch || !scratchCtx) {
    const canvas = document.createElement('canvas');
    canvas.width = INTERNAL_SIZE;
    canvas.height = INTERNAL_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('vfx-engine: failed to acquire a 2d canvas context');
    }
    scratch = canvas;
    scratchCtx = ctx;
  }
  return { canvas: scratch, ctx: scratchCtx };
}

/**
 * Paint an effect directly onto an existing context at an arbitrary progress.
 *
 * @vendored eoweb itself never calls this — it only ever rasterizes discrete
 * frames via renderFrameCanvas above. It exists for aio-editor's VfxPreview,
 * which animates the vendored copy of this engine continuously in a live
 * `<canvas>`. The `@vendored` tag is what stops `pnpm knip` reporting it as
 * an unused export (see knip.json).
 */
export function drawEffectAt(
  ctx: CanvasRenderingContext2D,
  def: VfxDef,
  progress: number,
  cx: number,
  cy: number,
): void {
  // Clear this effect's working region so callers can reuse a persistent
  // context frame-to-frame without ghosting.
  ctx.clearRect(
    cx - FRAME_SIZE / 2,
    cy - FRAME_SIZE / 2,
    FRAME_SIZE,
    FRAME_SIZE,
  );

  // 1. Rasterise at INTERNAL_SIZE on the reused scratch canvas. Cleared
  //    first — unlike renderFrameCanvas's fresh-per-call canvas, this one
  //    carries the previous call's pixels into the next.
  const { canvas: small, ctx: sctx } = getScratch();
  sctx.clearRect(0, 0, INTERNAL_SIZE, INTERNAL_SIZE);

  const k = INTERNAL_SIZE / DESIGN_SIZE;
  sctx.save();
  sctx.scale(k, k);
  sctx.globalCompositeOperation = def.additive ? 'lighter' : 'source-over';
  const half = DESIGN_SIZE / 2;
  KINDS[def.kind].draw(sctx, progress, def, half, half);
  if (def.combo) {
    KINDS[def.combo].draw(sctx, progress, def, half, half);
  }
  // Restores the transform (and composite op) to identity/default before the
  // NEXT call reuses this same context — without this, ctx.scale(k, k) would
  // compound across calls instead of starting fresh each time.
  sctx.restore();

  // 2. Quantise onto the ramp while still at raster resolution.
  quantizeToRamp(sctx, INTERNAL_SIZE, def.ramp);

  // 3. Stamp the quantised tile into the caller's context at integer scale,
  //    nearest-neighbour.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    small,
    0,
    0,
    INTERNAL_SIZE,
    INTERNAL_SIZE,
    cx - FRAME_SIZE / 2,
    cy - FRAME_SIZE / 2,
    FRAME_SIZE,
    FRAME_SIZE,
  );
}
