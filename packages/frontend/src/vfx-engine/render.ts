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
  const progress = def.frames > 1 ? frameIndex / (def.frames - 1) : 1;
  drawEffectAt(ctx, def, progress, FRAME_SIZE / 2, FRAME_SIZE / 2);
  return canvas;
}

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
