// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh
// Canvas2D dispatchers: rasterize a single frame to an offscreen canvas, or
// paint an effect directly onto an existing context at a given progress.

import { KINDS } from './kinds';
import { FRAME_SIZE, type VfxDef } from './types';

export function renderFrameCanvas(
  def: VfxDef,
  frameIndex: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_SIZE;
  canvas.height = FRAME_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('vfx-engine: failed to acquire a 2d canvas context');
  }
  // frames, NOT frames - 1. Both consumers must sample the SAME progress
  // domain or the preview stops predicting the game:
  //   * the editor animates continuously with ((now - start) / durationMs)
  //     % 1, whose range is the half-open [0, 1);
  //   * the game shows frame k for burst-progress in [k/frames,
  //     (k+1)/frames) (SkillBurst.step floors progress * frames).
  // Dividing by `frames` makes the rasterized grid {0, 1/n, ..., (n-1)/n} —
  // the left edge of each of those windows, and a strict subset of the
  // editor's domain. Dividing by `frames - 1` instead reached exactly 1.0 on
  // the last frame, where `globalAlpha` is 0 for 10 of the 15 kinds: the
  // final ~8% of every such burst rendered blank in-game, at a progress the
  // editor never samples at all.
  const progress = frameIndex / def.frames;
  drawEffectAt(ctx, def, progress, FRAME_SIZE / 2, FRAME_SIZE / 2);
  return canvas;
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

  ctx.save();
  ctx.globalCompositeOperation = def.additive ? 'lighter' : 'source-over';
  KINDS[def.kind].draw(ctx, progress, def, cx, cy);
  if (def.combo) {
    KINDS[def.combo].draw(ctx, progress, def, cx, cy);
  }
  ctx.restore();
}
