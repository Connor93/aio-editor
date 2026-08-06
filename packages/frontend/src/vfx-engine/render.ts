// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh
// Canvas2D dispatchers: rasterize a single frame to an offscreen canvas, or
// paint an effect directly onto an existing context at a given progress.
//
// Both paths share the same pixel pipeline: raster small (def.frame's
// internalW x internalH) in the draw functions' native DESIGN_SIZE-wide
// coordinate space, quantise every painted pixel onto the def's 4-rung ramp
// WHILE STILL at raster resolution (so the ramp bands land on whole pixels),
// then upscale by the integer PIXEL_SCALE — per axis — with smoothing off.
// Quantising after the upscale would resample the hard bands back into
// gradients and defeat the point. See FrameGeometry in types.ts for how a
// def's frame (SQUARE_FRAME for every effect that existed before set pieces,
// TALL_FRAME for descents) derives internalW/internalH/outW/outH from a
// draw-space box.

import type { DrawFn } from './kinds';
import { KINDS } from './kinds';
import type { Ramp } from './palette';
import type { DepthLayer, VfxDef } from './types';

/** Total playback time: one cycle of `frames`, repeated `loops` times. */
export function effectDurationMs(def: VfxDef): number {
  return def.frames * def.loops * def.frameMs;
}

/** Progress to draw for a given ABSOLUTE frame index (0 .. frames*loops-1).
 *  Sampled at the frame's MIDPOINT so a 4-frame cycle yields four evenly
 *  spaced distinct states instead of always starting at zero — at progress 0
 *  seven of the fifteen kinds are geometrically degenerate (zero radius /
 *  length / height) and would render blank. The index wraps within the cycle,
 *  which is what makes loops repeat rather than continue expanding. */
export function frameProgress(def: VfxDef, frameIndex: number): number {
  const f = ((frameIndex % def.frames) + def.frames) % def.frames;
  return (f + 0.5) / def.frames;
}

/** Snap every painted pixel onto the def's 4-rung ramp, using its own perceived
 *  brightness weighted by coverage as the index, and write it at full alpha.
 *  Hard steps, no dither: a screen-space dither pattern shimmers when the shape
 *  animates through it (explicitly rejected during design).
 *
 *  Runs on the frame's internal raster buffer, BEFORE upscaling, so the ramp
 *  bands are whole pixels rather than being resampled into gradients. Width
 *  and height are taken separately (not one square `size`) now that a def's
 *  internal raster can be taller than it is wide (see FrameGeometry). */
function quantizeToRamp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  ramp: Ramp,
): void {
  const img = ctx.getImageData(0, 0, width, height);
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

/** One rasterised frame per depth layer. `front` is always present — every
 *  kind supplies it (see KindConfig in kinds.ts). `behind`/`tint` are
 *  present only when the kind (or its combo) actually paints something
 *  there; a layer with no content is omitted rather than returned as a
 *  blank canvas, so a kind that doesn't use `behind`/`tint` costs nothing
 *  extra to rasterise or upload to the GPU. */
export interface LayerCanvases {
  behind?: HTMLCanvasElement;
  tint?: HTMLCanvasElement;
  front: HTMLCanvasElement;
}

/** Rasterises ONE frame of ONE cycle for ONE depth layer, given the list of
 *  draw functions that paint into it (the kind's own function plus, when a
 *  combo is set, the combo kind's function for the same layer). Shared by
 *  every layer of renderFrameCanvas below — this is the Task-2
 *  raster→quantise→upscale pipeline, unchanged, just parameterised over
 *  the def's own frame geometry (`def.frame`) instead of the old global
 *  square constants. Every def registered before this task carries
 *  SQUARE_FRAME, whose numbers ARE those old globals, so this produces
 *  byte-identical output for all of them. */
function rasterizeLayer(
  fns: readonly DrawFn[],
  def: VfxDef,
  frameIndex: number,
): HTMLCanvasElement {
  const f = def.frame;

  // 1. Rasterise at the frame's internal resolution. Draw functions keep
  //    writing in the DESIGN_SIZE-wide space and ctx.scale does the
  //    reduction — their geometry constants are tuned to a per-frame extent
  //    budget (SQUARE_FRAME: Chebyshev extent <= 62px at sizeScale 1.5;
  //    TALL_FRAME: asymmetric — see TALL_FRAME's doc comment in types.ts)
  //    and must NOT be rewritten.
  const small = document.createElement('canvas');
  small.width = f.internalW;
  small.height = f.internalH;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  if (!sctx) {
    throw new Error('vfx-engine: failed to acquire a 2d canvas context');
  }

  // Width-derived; both axes share it (internalH is designH scaled by the
  // very same factor — see makeFrame in types.ts), so a single ctx.scale(k,
  // k) is correct even for a non-square frame.
  const k = f.internalW / f.designW;
  sctx.save();
  sctx.scale(k, k);
  sctx.globalCompositeOperation = def.additive ? 'lighter' : 'source-over';
  const progress = frameProgress(def, frameIndex);
  for (const fn of fns) {
    // GROUND POINT, not the frame centre. For SQUARE_FRAME this is (64, 64)
    // — byte-identical to what every existing kind received before this
    // change (DESIGN_SIZE/2, DESIGN_SIZE/2).
    fn(sctx, progress, def, f.designW / 2, f.groundY);
  }
  sctx.restore();

  // 2. Quantise onto the ramp while still at raster resolution.
  quantizeToRamp(sctx, f.internalW, f.internalH, def.ramp);

  // 3. Upscale by an INTEGER factor, per axis, with smoothing off. A
  //    fractional ratio on either axis produces pixels of uneven size,
  //    which reads as a rendering fault.
  const out = document.createElement('canvas');
  out.width = f.outW;
  out.height = f.outH;
  const octx = out.getContext('2d');
  if (!octx) {
    throw new Error('vfx-engine: failed to acquire a 2d canvas context');
  }
  octx.imageSmoothingEnabled = false;
  octx.drawImage(small, 0, 0, f.internalW, f.internalH, 0, 0, f.outW, f.outH);
  return out;
}

/** Collects the kind's (and, if set, the combo's) draw function for a single
 *  layer, dropping whichever of the two is absent. */
function layerFns(def: VfxDef, layer: DepthLayer): DrawFn[] {
  const fns: DrawFn[] = [];
  const kindFn = KINDS[def.kind].draw[layer];
  if (kindFn) fns.push(kindFn);
  if (def.combo) {
    const comboFn = KINDS[def.combo].draw[layer];
    if (comboFn) fns.push(comboFn);
  }
  return fns;
}

/** Rasterises ONE frame of ONE cycle, across all three depth layers.
 *  `frameIndex` must be in `[0, def.frames)` — looping (`def.loops`) is a
 *  playback-side concern, not a rasterisation one: the caller reuses these
 *  same `def.frames` textures for every repeat of the cycle rather than this
 *  function producing `frames * loops` distinct images.
 *
 *  `front` is rasterised unconditionally (every kind supplies it).
 *  `behind`/`tint` are rasterised — and a canvas allocated for them — only
 *  when the kind (or its combo) actually paints something there. */
export function renderFrameCanvas(
  def: VfxDef,
  frameIndex: number,
): LayerCanvases {
  const result: LayerCanvases = {
    front: rasterizeLayer(layerFns(def, 'front'), def, frameIndex),
  };

  const behindFns = layerFns(def, 'behind');
  if (behindFns.length > 0) {
    result.behind = rasterizeLayer(behindFns, def, frameIndex);
  }

  const tintFns = layerFns(def, 'tint');
  if (tintFns.length > 0) {
    result.tint = rasterizeLayer(tintFns, def, frameIndex);
  }

  return result;
}

// Reused scratch canvas for drawEffectAt (below) — module-level, NOT
// allocated per call. The editor drives this on a continuous rAF loop, so a
// fresh canvas per frame would churn garbage on a hot path. Created lazily
// (only on first actual draw call) rather than at module scope, so importing
// this module in a headless context (e.g. `pnpm vfx:check`, which imports the
// whole `@/vfx-engine` barrel but never calls draw()/renderFrameCanvas()/
// drawEffectAt()) never touches `document`.
//
// Resized only when a call's frame dimensions differ from the LAST call's
// (scratchW/scratchH track what's currently allocated) — most callers hammer
// this with the same def (and therefore the same frame) every rAF tick, so
// reallocating on every call would defeat the whole point of reuse. A caller
// that alternates between two differently-sized frames (e.g. SQUARE_FRAME
// and TALL_FRAME back to back) will thrash this cache, but correctness never
// depends on the previous call's size — sctx.clearRect always covers exactly
// the current call's f.internalW x f.internalH before anything is drawn.
let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
let scratchW = 0;
let scratchH = 0;
function getScratch(
  internalW: number,
  internalH: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  if (
    !scratch ||
    !scratchCtx ||
    scratchW !== internalW ||
    scratchH !== internalH
  ) {
    const canvas = scratch ?? document.createElement('canvas');
    canvas.width = internalW;
    canvas.height = internalH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('vfx-engine: failed to acquire a 2d canvas context');
    }
    scratch = canvas;
    scratchCtx = ctx;
    scratchW = internalW;
    scratchH = internalH;
  }
  return { canvas: scratch, ctx: scratchCtx };
}

/**
 * Paint ONE depth layer of an effect directly onto an existing context at an
 * arbitrary progress. Returns early (painting nothing, not even a clear) if
 * neither the kind nor its combo has a draw function for `layer` — cheap for
 * callers that composite all three DEPTH_LAYERS every frame without first
 * checking which ones a given def actually uses.
 *
 * `(cx, cy)` is the def's GROUND POINT (the target's feet), not the frame
 * centre — for a def whose frame has `anchorY !== 0.5` (e.g. TALL_FRAME) the
 * painted box extends further above `cy` than below it. The destination
 * rect's top-left is therefore `(cx - f.outW / 2, cy - f.outH * f.anchorY)`;
 * for SQUARE_FRAME (anchorY 0.5) that reduces to the old `cy - f.outH / 2`.
 *
 * @vendored eoweb itself never calls this — it only ever rasterizes discrete
 * frames via renderFrameCanvas above. It exists for aio-editor's VfxPreview,
 * which animates the vendored copy of this engine continuously in a live
 * `<canvas>`, compositing `behind`/`tint`/`front` with three calls per frame
 * — one per layer, hardcoded rather than a loop over `DEPTH_LAYERS`, because
 * it has to interleave a character stand-in between the `behind` and `tint`
 * calls — the same depth order eoweb's 3-sprite renderer sandwiches around
 * the target with. The `@vendored` tag is what stops `pnpm knip` reporting
 * it as an unused export (see knip.json).
 */
export function drawEffectAt(
  ctx: CanvasRenderingContext2D,
  def: VfxDef,
  progress: number,
  cx: number,
  cy: number,
  layer: DepthLayer,
): void {
  const fns = layerFns(def, layer);
  if (fns.length === 0) return;

  const f = def.frame;
  const destX = cx - f.outW / 2;
  const destY = cy - f.outH * f.anchorY;

  // Clear this effect's working region so callers can reuse a persistent
  // context frame-to-frame without ghosting.
  ctx.clearRect(destX, destY, f.outW, f.outH);

  // 1. Rasterise at the frame's internal resolution on the reused scratch
  //    canvas. Cleared first — unlike renderFrameCanvas's fresh-per-call
  //    canvas, this one carries the previous call's pixels into the next.
  const { canvas: small, ctx: sctx } = getScratch(f.internalW, f.internalH);
  sctx.clearRect(0, 0, f.internalW, f.internalH);

  const k = f.internalW / f.designW;
  sctx.save();
  sctx.scale(k, k);
  sctx.globalCompositeOperation = def.additive ? 'lighter' : 'source-over';
  for (const fn of fns) {
    // GROUND POINT, not the frame centre — see rasterizeLayer's matching
    // comment. For SQUARE_FRAME this is (64, 64), byte-identical to before.
    fn(sctx, progress, def, f.designW / 2, f.groundY);
  }
  // Restores the transform (and composite op) to identity/default before the
  // NEXT call reuses this same context — without this, ctx.scale(k, k) would
  // compound across calls instead of starting fresh each time.
  sctx.restore();

  // 2. Quantise onto the ramp while still at raster resolution.
  quantizeToRamp(sctx, f.internalW, f.internalH, def.ramp);

  // 3. Stamp the quantised tile into the caller's context at integer scale,
  //    nearest-neighbour.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    small,
    0,
    0,
    f.internalW,
    f.internalH,
    destX,
    destY,
    f.outW,
    f.outH,
  );
}
