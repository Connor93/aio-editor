// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh
// Per-kind visual + default timing/compositing params. Draw functions must
// be pure & deterministic: the same (def, progress) always paints the same
// pixels, so NEVER call Math.random() — derive jitter from the particle
// index instead (e.g. `i * 2.399`). eoweb rasterizes frames to textures
// while a separate editor animates continuously; both must match.
//
// All 15 kinds are implemented here. `ring`, `disc`, `spark-burst` are the
// seed pattern the rest follow: save/restore is handled once by the caller
// (render.ts) around the whole draw (+ optional combo) call, so individual
// `draw` functions just set the ctx properties they need — no internal
// ctx.save()/ctx.restore(), and no ctx.translate()/ctx.rotate() (which would
// leak into a combo layer drawn right after). Every coordinate is instead
// computed directly from `cx`/`cy` via cos/sin offsets.
//
// Corollary of that shared-context convention: a draw function that sets a
// ctx property to a NON-default value which other kinds don't set for
// themselves must restore the canvas default before returning, or it leaks
// into the combo layer painted immediately after it. Today that's only
// `lineCap` (drawSlash/drawSpiral want 'round'; every other stroking kind
// relies on the 'butt' default) — both reset it. `lineWidth`, `globalAlpha`,
// `strokeStyle` and `fillStyle` need no such treatment: every kind that
// strokes or fills assigns them itself.
//
// ── Frame budget ────────────────────────────────────────────────────────
// Every kind is rasterized into a FRAME_SIZE (128px) square drawn centred,
// so anything painted more than 64px from the centre on either axis is hard
// clipped to a square edge. The largest registered `sizeScale` is 1.5 (the
// `-lg` variants), which means each kind's geometry constants are tuned so
// that its worst-case Chebyshev extent — max(|dx|, |dy|) over every painted
// pixel, including half the stroke width — stays at or below 62px at
// sizeScale 1.5, i.e. roughly 41px at base size. Two extra notes:
//   * `sizeScale` multiplies distances AND the size-proportional stroke
//     widths, so sm/base/lg stay visibly distinct (0.6x / 1.0x / 1.5x).
//   * `beam-pop` and `rain` are directional and would blow the vertical
//     budget if anchored naively at `cy`; both are anchored so their
//     travel band is centred in the frame instead (see their comments).
// If you change a constant below, re-verify with an instrumented context —
// eyeballing a 128px tile does not catch a 3px overrun.

import { RAMP_BASE } from './palette';
import type { ShapeKind, VfxDef } from './types';

export interface KindConfig {
  durationMs: number;
  frames: number;
  additive: boolean;
  draw(
    ctx: CanvasRenderingContext2D,
    progress: number,
    def: VfxDef,
    cx: number,
    cy: number,
  ): void;
}

/** A rung of the def's ramp as a CSS hex. Index is clamped, so `rung(def, 4)`
 *  is the hot rung rather than a crash. */
function rung(def: VfxDef, index: number): string {
  const i = Math.max(0, Math.min(def.ramp.length - 1, index));
  const c = def.ramp[i] as number;
  return `#${c.toString(16).padStart(6, '0')}`;
}

/** The def's base rung — the drop-in replacement for the old `toHex(def.color)`. */
function base(def: VfxDef): string {
  return rung(def, RAMP_BASE);
}

function rungRgba(def: VfxDef, index: number, alpha: number): string {
  const i = Math.max(0, Math.min(def.ramp.length - 1, index));
  const c = def.ramp[i] as number;
  return `rgba(${(c >> 16) & 0xff},${(c >> 8) & 0xff},${c & 0xff},${alpha})`;
}

// Deterministic per-index pseudo-scatter in [0, 1), generalizing the
// `i * 2.399` golden-angle trick used by spark-burst. Same index always
// yields the same value — no Math.random().
function indexFrac(i: number): number {
  const v = i * 2.399;
  return v - Math.floor(v);
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // 40 * 1.5 + lineWidth/2 = 61.5px extent at -lg.
  const radius = progress * 40 * def.sizeScale;
  ctx.globalAlpha = 1 - progress;
  ctx.lineWidth = 3;
  ctx.strokeStyle = base(def);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawDisc(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Filled, so no stroke padding on the outer edge: 41 * 1.5 = 61.5px at -lg.
  const radius = progress * 41 * def.sizeScale;

  ctx.globalAlpha = 0.6 * (1 - progress);
  ctx.fillStyle = base(def);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Brighter core ring to sell a "hot center".
  ctx.globalAlpha = 1 - progress;
  ctx.lineWidth = 2;
  ctx.strokeStyle = rung(def, RAMP_BASE + 1);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawSparkBurst(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const sparkCount = 14;
  // 40 * 1.5 + lineWidth/2 = 61.0px extent at -lg.
  const length = progress * 40 * def.sizeScale;
  const inner = length * 0.2;

  ctx.globalAlpha = 1 - progress;
  ctx.lineWidth = 2;
  ctx.strokeStyle = base(def);

  for (let i = 0; i < sparkCount; i++) {
    // Deterministic per-spark jitter derived from the index — no Math.random().
    const angle = (i / sparkCount) * Math.PI * 2 + i * 2.399;
    const x1 = cx + Math.cos(angle) * inner;
    const y1 = cy + Math.sin(angle) * inner;
    const x2 = cx + Math.cos(angle) * length;
    const y2 = cy + Math.sin(angle) * length;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

// Curved arc swipe: the stroke sweeps from -0.6π to 0.6π as `progress`
// advances, drawn as many small segments so the width can taper from thin
// at the tail to thick at the leading edge — a blade swipe, not a static arc.
function drawSlash(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // The taper's half-width stacks on the arc radius, so both shrink together:
  // 36 * 1.5 + (1.5 + (23/24) * 8 * 1.5) / 2 = 60.5px extent at -lg.
  const radius = 36 * def.sizeScale;
  const startAngle = -0.6 * Math.PI;
  const endAngle = startAngle + progress * 1.2 * Math.PI;
  const segments = 24;

  ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = base(def);
  ctx.lineCap = 'round';

  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const a0 = startAngle + (endAngle - startAngle) * t0;
    const a1 = startAngle + (endAngle - startAngle) * t1;
    // Taper: thin near the tail (t0 ~ 0), thick near the leading edge.
    ctx.lineWidth = 1.5 + t0 * 8 * def.sizeScale;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, a0, a1);
    ctx.stroke();
  }

  // Restore the canvas default — a combo layer is drawn straight after this
  // inside the same save/restore (see the shared-context note up top).
  ctx.lineCap = 'butt';
}

// Spiral polyline traced from the center outward: theta = t*6π, r = t*46*scale
// for t in [0, progress] — the curve grows as the effect plays, alpha fading.
function drawSpiral(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const steps = 40;

  ctx.globalAlpha = 1 - progress * 0.8;
  ctx.lineWidth = 2.5 * def.sizeScale;
  ctx.strokeStyle = base(def);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * progress;
    const theta = t * 6 * Math.PI;
    // 39 * 1.5 + lineWidth/2 = 60.4px extent at -lg.
    const r = t * 39 * def.sizeScale;
    const x = cx + Math.cos(theta) * r;
    const y = cy + Math.sin(theta) * r;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Restore the canvas default — a combo layer is drawn straight after this
  // inside the same save/restore (see the shared-context note up top).
  ctx.lineCap = 'butt';
}

// A small 4-point sparkle glyph (a diamond with a long + short axis) — the
// classic twinkle shape.
function drawStar4(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.25, y - size * 0.25);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x + size * 0.25, y + size * 0.25);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.25, y + size * 0.25);
  ctx.lineTo(x - size, y);
  ctx.lineTo(x - size * 0.25, y - size * 0.25);
  ctx.closePath();
  ctx.fill();
}

// ~10 fixed-position twinkles (deterministic golden-angle scatter), each
// scaling up then down over `progress` with a per-index phase offset so they
// don't all pop in unison.
function drawSparkle(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const count = 10;
  ctx.fillStyle = base(def);

  for (let i = 0; i < count; i++) {
    const angle = i * 2.399;
    // A twinkle's own half-size stacks on its scatter distance, so both
    // shrink together: 36 * 1.5 * maxFrac + 7.5 * 1.5 = 60.0px at -lg.
    const dist = indexFrac(i * 7 + 3) * 36 * def.sizeScale;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;

    const phase = (progress + i / count) % 1;
    const s = Math.sin(phase * Math.PI); // 0 -> 1 -> 0
    if (s <= 0) {
      continue;
    }
    ctx.globalAlpha = s;
    drawStar4(ctx, x, y, s * 7.5 * def.sizeScale);
  }
}

// The "big pop": a bright white-to-color radial flash plus an expanding thin
// ring shockfront.
function drawNova(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Flash and shockfront shrink in step (26/56 -> 19/40) so the "small hot
  // core inside a wide ring" read is unchanged: 40 * 1.5 + lineWidth/2 =
  // 61.0px extent at -lg.
  const flashRadius = 19 * def.sizeScale * (1 - progress * 0.3);
  const gradient = ctx.createRadialGradient(
    cx,
    cy,
    0,
    cx,
    cy,
    Math.max(flashRadius, 0.01),
  );
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(1, base(def));

  ctx.globalAlpha = 1 - progress;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(flashRadius, 0.01), 0, Math.PI * 2);
  ctx.fill();

  const ringRadius = progress * 40 * def.sizeScale;
  ctx.globalAlpha = (1 - progress) * 0.85;
  ctx.lineWidth = 2;
  ctx.strokeStyle = base(def);
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  ctx.stroke();
}

// Flat ground wave: a vertically-squashed ellipse ring expanding outward.
function drawShockwave(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // 40 * 1.5 + lineWidth/2 = 61.5px extent at -lg (rx is the wide axis).
  const rx = Math.max(progress * 40 * def.sizeScale, 0.01);
  const ry = rx * 0.5;

  ctx.globalAlpha = 1 - progress;
  ctx.lineWidth = 3;
  ctx.strokeStyle = base(def);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// A vertical pillar rising from a baseline below `cy`: a gradient-filled
// rect fading to transparent at its tip.
//
// SPECIAL HANDLING (frame budget): a pillar anchored at `cy` grows in ONE
// direction, so it can only ever use the top half of the frame — the old
// 80-unit height overflowed even at base size (80 > 64). Rather than halve
// the pillar, the baseline moves down to `cy + 40 * sizeScale` so the pillar
// spans the frame's full vertical range symmetrically: at -lg it runs from
// cy+60 down-to-up to cy-60, i.e. exactly ±60px. The pillar keeps its full
// original height and gradient; only its anchor within the tile changed.
// Reads better in-game too — the beam now starts below the target's centre
// (around a standing sprite's feet) and rises past it.
function drawBeamPop(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const baseY = cy + 40 * def.sizeScale;
  const height = progress * 80 * def.sizeScale;
  const width = 9 * def.sizeScale;
  const top = baseY - height;

  const gradient = ctx.createLinearGradient(cx, baseY, cx, top);
  gradient.addColorStop(0, rungRgba(def, RAMP_BASE, 1));
  gradient.addColorStop(1, rungRgba(def, RAMP_BASE, 0));

  ctx.globalAlpha = 1 - progress * 0.6;
  ctx.fillStyle = gradient;
  ctx.fillRect(cx - width / 2, top, width, height);
}

// Reverse of ring: a stroked ring plus small orbiting particles converging
// INWARD toward a bright core flare — good for debuffs/drains.
function drawImplode(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // The converging particles sit ON the ring, so their own radius stacks on
  // it: 39 * 1.5 + 2 * 1.5 = 61.5px extent at -lg (the ring's own
  // lineWidth/2 of 1.5 is smaller than the 3px particle, so it doesn't bind).
  const radius = (1 - progress) * 39 * def.sizeScale;

  ctx.globalAlpha = 0.25 + progress * 0.75;
  ctx.lineWidth = 3;
  ctx.strokeStyle = base(def);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  const count = 8;
  ctx.fillStyle = base(def);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + i * 2.399;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.arc(x, y, 2 * def.sizeScale, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bright core flare as everything collapses to the center.
  ctx.globalAlpha = progress * progress;
  ctx.beginPath();
  ctx.arc(cx, cy, 6 * def.sizeScale, 0, Math.PI * 2);
  ctx.fill();
}

// Several curved arcs rotating around the center, radius pulsing — a
// whirling vortex.
function drawVortex(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const arms = 3;
  const baseRadius = 30 * def.sizeScale;
  const pulse = 1 + 0.25 * Math.sin(progress * Math.PI * 4);
  const rotation = progress * 4 * Math.PI;

  ctx.globalAlpha = 1 - progress;
  ctx.lineWidth = 3;
  ctx.strokeStyle = base(def);

  for (let i = 0; i < arms; i++) {
    const start = rotation + (i / arms) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * pulse, start, start + Math.PI * 0.6);
    ctx.stroke();
  }
}

// ~12 short vertical streaks falling past the center, staggered by index,
// fading out as each one reaches the bottom of its cycle.
function drawRain(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const count = 12;
  // SPECIAL HANDLING (frame budget): the old code reused one `spread` for
  // both axes AND for the fall distance, which made the vertical travel 2.6x
  // the horizontal half-width — 105px at -lg, overflowing even at base size.
  // The three are now independent so the fall band can be centred on `cy`:
  //   horizontal:  40 * 1.5 + lineWidth/2      = 61.0px at -lg
  //   top of run:  (28 + 12) * 1.5 + lw/2      = 61.0px at -lg
  //   end of run:  (68 - 28) * 1.5 + lw/2      = 61.0px at -lg
  // Same 12 staggered streaks falling past the centre and fading out; they
  // just travel a shorter, on-canvas distance.
  const spread = 40 * def.sizeScale;
  const streakLen = 12 * def.sizeScale;
  const fallTop = -28 * def.sizeScale;
  const fallSpan = 68 * def.sizeScale;

  ctx.strokeStyle = base(def);
  ctx.lineWidth = 2;

  for (let i = 0; i < count; i++) {
    const x = cx + (indexFrac(i) - 0.5) * spread * 2;
    const stagger = indexFrac(i + 41);
    const localP = (progress + stagger) % 1;
    const y = cy + fallTop + localP * fallSpan;

    ctx.globalAlpha = 1 - localP;
    ctx.beginPath();
    ctx.moveTo(x, y - streakLen);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
}

// 2-3 zigzag polylines radiating from the center, lightning-like, with
// deterministic per-segment jitter and an alpha flicker driven by progress.
function drawChains(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const chainCount = 3;
  const segments = 5;
  // Length and jag shrink together to keep the zigzag's amplitude-to-reach
  // ratio: 40 * 1.5 + jag + lineWidth/2 = 61.9px extent at -lg.
  const length = 40 * def.sizeScale * Math.min(1, progress * 1.5);

  ctx.strokeStyle = base(def);
  ctx.lineWidth = 2;

  for (let c = 0; c < chainCount; c++) {
    const baseAngle = (c / chainCount) * Math.PI * 2 + c * 1.7;
    const flicker =
      0.4 + 0.6 * Math.abs(Math.sin(progress * Math.PI * 5 + c * 2.4));
    ctx.globalAlpha = flicker * (1 - progress);

    const dirX = Math.cos(baseAngle);
    const dirY = Math.sin(baseAngle);
    const perpX = -dirY;
    const perpY = dirX;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const along = t * length;
      const jag = (indexFrac(c * 17 + s * 11) - 0.5) * 9 * def.sizeScale;
      const x = cx + dirX * along + perpX * jag;
      const y = cy + dirY * along + perpY * jag;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ~5 dots circling the center — good for stun-stars.
function drawOrbit(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const count = 5;
  // Each dot's own radius stacks on the orbit: (37 + 4) * 1.5 = 61.5px at -lg.
  const radius = 37 * def.sizeScale;

  ctx.fillStyle = base(def);
  ctx.globalAlpha = 1 - progress * 0.2;

  for (let i = 0; i < count; i++) {
    const theta = progress * Math.PI * 2 + (i * Math.PI * 2) / count;
    const x = cx + Math.cos(theta) * radius;
    const y = cy + Math.sin(theta) * radius;
    ctx.beginPath();
    ctx.arc(x, y, 4 * def.sizeScale, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Manga-style speed lines radiating straight out from the center, N=16,
// length pulsing (a quick snap-out) with progress.
function drawBurstLines(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const count = 16;
  // Lines start at `inner` and run out to inner + maxLen, so the two stack:
  // (4 + 36) * 1.5 + lineWidth/2 = 60.75px extent at -lg.
  const maxLen = 36 * def.sizeScale;
  const inner = 4 * def.sizeScale;
  const lenFactor = Math.sin(Math.min(progress * 1.6, 1) * Math.PI * 0.5);

  ctx.strokeStyle = base(def);
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 1 - progress;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const outer = inner + lenFactor * maxLen;
    const x1 = cx + Math.cos(angle) * inner;
    const y1 = cy + Math.sin(angle) * inner;
    const x2 = cx + Math.cos(angle) * outer;
    const y2 = cy + Math.sin(angle) * outer;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

// Impacts: short, punchy hits.
const IMPACT_TIMING = { durationMs: 350, frames: 12, additive: true } as const;
// Sustained/looping-feel effects: a little longer and smoother.
const FLOW_TIMING = { durationMs: 500, frames: 14, additive: true } as const;

export const KINDS: Record<ShapeKind, KindConfig> = {
  ring: { ...IMPACT_TIMING, draw: drawRing },
  disc: { ...IMPACT_TIMING, draw: drawDisc },
  'spark-burst': { ...IMPACT_TIMING, draw: drawSparkBurst },
  slash: { ...IMPACT_TIMING, draw: drawSlash },
  nova: { ...IMPACT_TIMING, draw: drawNova },
  shockwave: { ...IMPACT_TIMING, draw: drawShockwave },
  implode: { ...IMPACT_TIMING, draw: drawImplode },
  'burst-lines': { ...IMPACT_TIMING, draw: drawBurstLines },
  sparkle: { ...FLOW_TIMING, draw: drawSparkle },
  spiral: { ...FLOW_TIMING, draw: drawSpiral },
  vortex: { ...FLOW_TIMING, draw: drawVortex },
  orbit: { ...FLOW_TIMING, draw: drawOrbit },
  chains: { ...FLOW_TIMING, draw: drawChains },
  rain: { ...FLOW_TIMING, draw: drawRain },
  'beam-pop': { ...FLOW_TIMING, draw: drawBeamPop },
};
