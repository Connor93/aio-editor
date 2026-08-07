// SYNCED FROM eoweb src/vfx-engine — DO NOT EDIT HERE. Regenerate: eoweb/scripts/sync-vfx-engine.sh
// Per-kind visual + default timing/compositing params. Draw functions must
// be pure & deterministic: the same (def, progress) always paints the same
// pixels, so NEVER call Math.random() — derive jitter from the particle
// index instead (e.g. `i * 2.399`). eoweb rasterizes frames to textures
// while a separate editor animates continuously; both must match.
//
// All 21 kinds are implemented here. `ring`, `disc`, `spark-burst` are the
// seed pattern the rest follow: save/restore is handled once by the caller
// (render.ts) around the whole draw (+ optional combo) call, so individual
// `draw` functions just set the ctx properties they need — no internal
// ctx.save()/ctx.restore(), and no ctx.translate()/ctx.rotate() (which would
// leak into a combo layer drawn right after). Every coordinate is instead
// computed directly from `cx`/`cy` via cos/sin offsets.
//
// There is no exception to that today. `cleave` briefly had one — it
// save/rotate/scale'd to mirror its flurry cycles — but the redraw that turned
// it from an arc into a straight cut expressed the two diagonals as two
// ANGLES instead, so the transform went away with the arc. Worth remembering
// as the general shape of the fix: wanting a mirrored or rotated copy is
// usually a sign the geometry is being described in the wrong frame, not that
// the convention needs bending.
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
// Every kind is drawn into a DESIGN_SIZE (128px) square centred at
// (DESIGN_SIZE/2, DESIGN_SIZE/2) — the coordinate space every draw function
// below writes in (see types.ts). render.ts reduces that down to the actual
// INTERNAL_SIZE raster via ctx.scale; it never touches these constants.
// Anything painted more than 64px from the centre on either axis is hard
// clipped to that square's edge. The largest registered `sizeScale` is 1.5
// (the `-lg` variants), which means each kind's geometry constants are tuned
// so that its worst-case Chebyshev extent — max(|dx|, |dy|) over every
// painted pixel, including half the stroke width — stays at or below 62px at
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

export type DrawFn = (
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
) => void;

// Three depth passes per kind (see DepthLayer in types.ts). `front` is the
// only mandatory one — every kind painted a single decal layer before this
// task, so `front` is that same body moved verbatim. `behind`/`tint` are
// left undefined here; Task 5 fills two kinds in as exemplars, and a kind
// with no content for a layer simply omits the key rather than supplying a
// no-op function — render.ts's renderFrameCanvas uses that absence to skip
// rasterising (and allocating a canvas for) an empty layer.
export interface KindConfig {
  frames: number;
  loops: number;
  frameMs: number;
  additive: boolean;
  draw: {
    behind?: DrawFn;
    tint?: DrawFn;
    front: DrawFn;
  };
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

// Task 5: `ring` becomes a squashed ground-plane ellipse around the
// character's feet, split into a `behind` (far) and `front` (near) arc
// instead of one full stroked circle — the far side is occluded by the
// character standing at the centre, the near side draws over their shoes.
// `rx` keeps the exact pre-Task-5 radius maths (still the wide axis, and
// still the extent's binding constraint — see drawRingBehind/Front below);
// only the vertical squash (`ry = rx * 0.42`) and the half-arc split are new.
function ringRadii(progress: number, def: VfxDef): { rx: number; ry: number } {
  const rx = progress * 40 * def.sizeScale;
  return { rx, ry: rx * 0.42 };
}

function drawRingBehind(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Far arc (top half on screen). rx unchanged from before Task 5, so the
  // extent is still rx + lineWidth/2 = 40 * 1.5 + 1.5 = 61.5px at -lg — the
  // squash only shrinks ry, which was never the binding axis.
  const { rx, ry } = ringRadii(progress, def);
  ctx.globalAlpha = 1 - progress;
  ctx.lineWidth = 3;
  ctx.strokeStyle = base(def);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
}

function drawRingFront(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Near arc (bottom half on screen, drawn over the character's feet). Same
  // extent maths as drawRingBehind.
  const { rx, ry } = ringRadii(progress, def);
  ctx.globalAlpha = 1 - progress;
  ctx.lineWidth = 3;
  ctx.strokeStyle = base(def);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.stroke();
}

// Shared by ring's and shockwave's `tint` layer: a soft wash roughly the
// footprint of a standing character in this same DESIGN_SIZE space.
// Deliberately NOT multiplied by `def.sizeScale` — a bigger ring doesn't mean
// a bigger character underneath it — and offset up from the feet-anchored
// `cy` so it sits over the torso rather than the ground. Extent: dx = 18,
// dy = 26 + 30 = 56 (filled, no stroke padding), both comfortably under the
// 62px budget.
const GROUND_TINT_RX = 18;
const GROUND_TINT_RY = 30;
const GROUND_TINT_Y_OFFSET = 26;

function drawGroundTintWash(
  ctx: CanvasRenderingContext2D,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  ctx.fillStyle = base(def);
  ctx.beginPath();
  ctx.ellipse(
    cx,
    cy - GROUND_TINT_Y_OFFSET,
    GROUND_TINT_RX,
    GROUND_TINT_RY,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

function drawRingTint(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // At this alpha, quantizeToRamp's luminance*coverage maths (see render.ts)
  // maps most of this wash's life to either nothing or the ramp's shadow
  // rung — never the bright/hot end. That's what keeps it a glow instead of
  // an opaque disc once Task 6 composites `tint` onto the sprite with an
  // 'add' blend mode: adding a dark colour barely brightens anything.
  ctx.globalAlpha = (1 - progress) * 0.4;
  drawGroundTintWash(ctx, def, cx, cy);
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
// Task 5: already a squashed ground ellipse (unlike ring, which had to gain
// its squash this task), so the split here is purely the far/near arc
// division — `rx`/`ry` maths is untouched.
function shockwaveRadii(
  progress: number,
  def: VfxDef,
): { rx: number; ry: number } {
  const rx = Math.max(progress * 40 * def.sizeScale, 0.01);
  return { rx, ry: rx * 0.5 };
}

function drawShockwaveBehind(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Far arc. rx unchanged from before Task 5: extent is still
  // rx + lineWidth/2 = 40 * 1.5 + 1.5 = 61.5px at -lg.
  const { rx, ry } = shockwaveRadii(progress, def);
  ctx.globalAlpha = 1 - progress;
  ctx.lineWidth = 3;
  ctx.strokeStyle = base(def);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
}

function drawShockwaveFront(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Near arc, drawn over the character's feet. Same extent maths as
  // drawShockwaveBehind.
  const { rx, ry } = shockwaveRadii(progress, def);
  ctx.globalAlpha = 1 - progress;
  ctx.lineWidth = 3;
  ctx.strokeStyle = base(def);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.stroke();
}

function drawShockwaveTint(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // A brief flash on the impact frames only — a shockwave's hit reads as
  // instantaneous, not a sustained glow like ring's wash. Gated off past the
  // midpoint entirely (no draw call at all, not just alpha 0), and even
  // within progress < 0.5 the alpha decays fast enough that only the very
  // first frame survives quantizeToRamp's luminance*coverage cut for most
  // ramps — see drawRingTint's comment for why that's by design, not a bug.
  if (progress >= 0.5) return;
  ctx.globalAlpha = (0.5 - progress) * 0.8;
  drawGroundTintWash(ctx, def, cx, cy);
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
//
// Task 8 (44px survey): at the original lineWidth of 2, the stroke reduces
// to ~0.69px at INTERNAL_SIZE (2 * 44/128) — thin enough that
// quantizeToRamp's coverage*luminance cutoff dropped most of the path on
// every non-tail frame (measured: dark hit literally 0 painted pixels at
// frame 2/4, every other element sat well under the 20px break-up floor).
// Thickened to 3.5 (internal ~1.2px, comfortably above one raster pixel)
// with no other geometry changed; extent re-verified below.
function drawChains(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const chainCount = 3;
  const segments = 5;
  // Length unchanged; extent's binding term is length + lineWidth/2 (the jag
  // offset lands on the OTHER axis at the worst-case angle, not stacking):
  // measured 60.70px at -lg, under the 62px budget. Was 61.00px before this
  // task's lineWidth bump.
  const length = 40 * def.sizeScale * Math.min(1, progress * 1.5);

  ctx.strokeStyle = base(def);
  ctx.lineWidth = 3.5;

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

// Manga-style speed lines radiating straight out from the center, length
// pulsing (a quick snap-out) with progress.
//
// Task 8 (44px survey): at the original lineWidth of 1.5 (internal
// ~0.52px), full-length/low-alpha frames (the length peaks right as alpha
// is already fading, around frame 2/4) collapsed to LITERALLY ZERO painted
// pixels for several elements (fire/water/earth/dark all measured 0 at
// sizeScale 1.5). Fixed by thickening to 3.5 (internal ~1.2px) AND cutting
// the line count from 16 to 12 — fewer, fatter speed-lines per the brief's
// stated fix pattern, which also reduces how much adjacent thin lines were
// visually merging into a single blur at 44px. No length/inner change.
function drawBurstLines(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const count = 12;
  // Lines start at `inner` and run out to inner + maxLen, so the two stack;
  // lineWidth is the only term this task changed. Measured 60.00px at -lg,
  // under the 62px budget — was 60.75px before.
  const maxLen = 36 * def.sizeScale;
  const inner = 4 * def.sizeScale;
  const lenFactor = Math.sin(Math.min(progress * 1.6, 1) * Math.PI * 0.5);

  ctx.strokeStyle = base(def);
  ctx.lineWidth = 3.5;
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

// ── Set pieces ──────────────────────────────────────────────────────────
// All six set pieces are authored with real art now — Task 4 only wired
// the plumbing (all four threw `unimplemented`); Task 5 did `bolt`/`smite`,
// Task 6 (below the smite functions) does `rockfall`/`ring-of-fire`, and a
// later pair of tasks added `cleave`/`swordfall` (below the ring-of-fire
// functions).
//
// `bolt`, `smite` and `rockfall` use TALL_FRAME: draw-space box 128 wide x
// 256 tall, ground point handed to draw functions as (cx, cy) = (64, 192) —
// see FrameGeometry / TALL_FRAME in types.ts. `ring-of-fire` is a sustained
// ground effect, not a descent, so it uses SQUARE_FRAME instead — see its
// own comment further down for that budget. `swordfall` is also a descent —
// a blade falling from off-screen and planting — so it uses TALL_FRAME too.
// `cleave`, by contrast, is neither a descent nor a ground effect: it's a
// swing that lands on the target's body like the kinds above it, so it uses
// SQUARE_FRAME and keeps the historic body lift (FrameGeometry.bodyLift in
// types.ts). Set pieces are element-only and size-less (registry.ts's
// SET_PIECES loop always builds them with sizeScale 1), so unlike every kind
// above, their geometry constants are NOT multiplied by `def.sizeScale` —
// there is no sm/lg variant to stay proportional with.
//
// Extent budget for TALL_FRAME is ASYMMETRIC and NOT what the original task
// spec said. The spec's "<=126px above cy" was derived from half the frame
// height (256/2) rather than from where the ground point actually sits
// (3/4 of the way down), which would waste a third of the headroom that is
// the entire reason TALL_FRAME exists. Correct numbers, re-derived from
// designH=256 and groundY=192:
//   horizontal from cx:  +/-64 available -> budget <= 62  (same as SQUARE_FRAME)
//   above cy (headroom):  192 available  -> budget <= 190
//   below cy (past the target): 64 available -> budget <= 62
// Verified with a throwaway instrumented context; see the Task 5/6 reports
// for the per-element, per-frame, per-layer table.

// `bolt`: a forked lightning strike. `behind` paints the upper fork (the
// jagged bolt descending from off-screen), `front` continues it down into
// the ground plus a widening ground flash, `tint` is a brief hot flash over
// the character on the two middle frames only. Jitter reuses `indexFrac` —
// the same deterministic-scatter primitive drawChains uses for its zigzag,
// not a new PRNG.
const BOLT_UPPER_TOP = 120; // cy - this: where the upper fork starts
const BOLT_UPPER_BOTTOM = 30; // cy - this: where the upper fork ends and
// the lower fork picks up
const BOLT_TRUNK_SEGMENTS = 6;
const BOLT_LOWER_SEGMENTS = 3;
// Max horizontal jitter magnitude for the trunk/branches. Comfortably inside
// the 62px horizontal budget by itself; branches add at most ~24px on top
// (see drawBoltBehind), still well clear.
const BOLT_JITTER = 9;

function drawBoltBehind(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Frames 0-1 (progress < 0.5): bright, full height. Frames 2-3: thinner
  // and fading — the strike has already landed (see drawBoltFront) and the
  // upper fork is dissipating.
  const late = progress >= 0.5;
  const topY = cy - BOLT_UPPER_TOP;
  const bottomY = cy - BOLT_UPPER_BOTTOM;

  ctx.strokeStyle = base(def);
  ctx.lineWidth = late ? 2 : 3.5;
  ctx.globalAlpha = late ? 0.35 : 1;

  // Main trunk: a jagged polyline from the top of the fork down to where
  // the lower fork picks up. Same zigzag idiom as drawChains — per-segment
  // jitter derived from the segment index via indexFrac, never Math.random.
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  for (let s = 1; s <= BOLT_TRUNK_SEGMENTS; s++) {
    const t = s / BOLT_TRUNK_SEGMENTS;
    const y = topY + (bottomY - topY) * t;
    const jag = (indexFrac(s * 11 + 3) - 0.5) * 2 * BOLT_JITTER;
    ctx.lineTo(cx + jag, y);
  }
  ctx.stroke();

  // Two side branches forking off the upper trunk, diverging left/right —
  // this is what makes it read as "forked" rather than a single zigzag.
  for (let b = 0; b < 2; b++) {
    const originT = 0.3 + b * 0.3;
    const originY = topY + (bottomY - topY) * originT;
    const dir = b === 0 ? -1 : 1;
    const reach = 14 + indexFrac(b * 13 + 5) * 10;
    ctx.beginPath();
    ctx.moveTo(cx, originY);
    ctx.lineTo(cx + dir * reach, originY + reach * 0.8);
    ctx.stroke();
  }
}

function drawBoltFront(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const late = progress >= 0.5;
  const topY = cy - BOLT_UPPER_BOTTOM; // continues where the upper fork left off
  const bottomY = cy;

  ctx.strokeStyle = base(def);
  ctx.lineWidth = late ? 2 : 3.5;
  ctx.globalAlpha = late ? 0.5 : 1;

  // Lower fork: continues the trunk down into the ground point. Different
  // index offsets from the upper fork's jag (s*7+40 vs s*11+3) so the two
  // halves don't look like a mechanically repeated pattern.
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  for (let s = 1; s <= BOLT_LOWER_SEGMENTS; s++) {
    const t = s / BOLT_LOWER_SEGMENTS;
    const y = topY + (bottomY - topY) * t;
    const jag = (indexFrac(s * 7 + 40) - 0.5) * 2 * BOLT_JITTER;
    ctx.lineTo(cx + jag, y);
  }
  ctx.stroke();

  // Ground flash: a squashed ellipse at the ground point. Absent on frame 0
  // (progress 0.125 — the bolt hasn't landed yet), then widening across
  // frames 1-3. Max rx (progress 0.875) is ~32.5, ry ~13 — both comfortably
  // inside budget.
  if (progress > 0.25) {
    const rx = 10 + (progress - 0.25) * 36;
    const ry = rx * 0.4;
    ctx.globalAlpha = late ? 0.5 : 0.9;
    ctx.fillStyle = rung(def, RAMP_BASE + 1);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBoltTint(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Frames 1-2 only (progress in (0.25, 0.75)) — a brief hot-rung flash over
  // the character as the strike lands. Frames 0 and 3 paint nothing at all
  // (no draw call, not just alpha 0 — same convention as drawShockwaveTint).
  // Reuses the GROUND_TINT_* geometry (already proven under budget: dx=18,
  // dy=56) but at the ramp's hot rung rather than `base`, per the brief's
  // "hot-rung flash" — drawGroundTintWash hardcodes `base`, so this is
  // inlined rather than calling it.
  if (progress <= 0.25 || progress >= 0.75) return;
  ctx.globalAlpha = 1;
  ctx.fillStyle = rung(def, RAMP_BASE + 1);
  ctx.beginPath();
  ctx.ellipse(
    cx,
    cy - GROUND_TINT_Y_OFFSET,
    GROUND_TINT_RX,
    GROUND_TINT_RY,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

// `smite`: a descending pillar of light into a ground flash. `behind` is the
// pillar's outer/rear half (a wide, soft tapering band), `front` is the
// near/core half (narrower, brighter, same band shape) plus the ground
// flash, `tint` is a sustained wash across frames 1-3 — the one set piece
// where a lingering tint is correct, since the character is standing IN the
// beam rather than merely near an impact.
//
// Both layers share the same animated band shape: a fixed top edge near the
// top of the frame, and a bottom edge whose offset above `cy` is computed by
// smiteBottomOffset. Frames 0-1 sweep the bottom edge down, striking the
// ground exactly on frame 1 (offset 0); frames 2-3 pull it back up while
// fading — closed-form linear pieces solved so the two SAMPLED progress
// values in each phase (there is no continuous animation to reason about —
// only 0.125/0.375/0.625/0.875 are ever evaluated) land on the intended
// offsets: 90 -> 0 for frames 0-1, then 20 -> 60 for frames 2-3.
const SMITE_TOP_Y_OFFSET = 186; // cy - this = the band's fixed top edge.
// Stays inside the <=190 above-cy budget with 4px of slack.
const SMITE_BEHIND_TOP_HALF_WIDTH = 5;
const SMITE_BEHIND_BASE_HALF_WIDTH = 11;
const SMITE_FRONT_TOP_HALF_WIDTH = 3;
const SMITE_FRONT_BASE_HALF_WIDTH = 7;

function smiteBottomOffset(progress: number): {
  offset: number;
  alpha: number;
} {
  if (progress < 0.5) {
    // Frames 0-1: descend. offset(0.125) = 90, offset(0.375) = 0 — the beam
    // reaches the ground exactly on frame 1.
    return { offset: 135 - 360 * progress, alpha: 1 };
  }
  // Frames 2-3: retract upward from the ground while fading.
  // offset(0.625) = 20, offset(0.875) = 60; alpha(0.625) = 0.825,
  // alpha(0.875) = 0.475.
  const t = 2 * progress - 1;
  return { offset: 80 * t, alpha: 1 - t * 0.7 };
}

function drawSmiteBehind(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const { offset, alpha } = smiteBottomOffset(progress);
  const topY = cy - SMITE_TOP_Y_OFFSET;
  const bottomY = cy - offset;

  // Rear half reads softer than the front core — same band shape, lower alpha.
  ctx.globalAlpha = alpha * 0.6;
  ctx.fillStyle = base(def);
  ctx.beginPath();
  ctx.moveTo(cx - SMITE_BEHIND_TOP_HALF_WIDTH, topY);
  ctx.lineTo(cx + SMITE_BEHIND_TOP_HALF_WIDTH, topY);
  ctx.lineTo(cx + SMITE_BEHIND_BASE_HALF_WIDTH, bottomY);
  ctx.lineTo(cx - SMITE_BEHIND_BASE_HALF_WIDTH, bottomY);
  ctx.closePath();
  ctx.fill();
}

function drawSmiteFront(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const { offset, alpha } = smiteBottomOffset(progress);
  const topY = cy - SMITE_TOP_Y_OFFSET;
  const bottomY = cy - offset;

  // Near half: a brighter, narrower core down the middle of the same band.
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rung(def, RAMP_BASE + 1);
  ctx.beginPath();
  ctx.moveTo(cx - SMITE_FRONT_TOP_HALF_WIDTH, topY);
  ctx.lineTo(cx + SMITE_FRONT_TOP_HALF_WIDTH, topY);
  ctx.lineTo(cx + SMITE_FRONT_BASE_HALF_WIDTH, bottomY);
  ctx.lineTo(cx - SMITE_FRONT_BASE_HALF_WIDTH, bottomY);
  ctx.closePath();
  ctx.fill();

  // Ground flash: appears once the beam first reaches the ground (frame 1,
  // progress 0.375) and lingers through frame 3, independent of the band's
  // own retract-and-fade above. Max rx (progress 0.875) is ~27.5, ry ~11.
  if (progress > 0.25) {
    const rx = 10 + (progress - 0.25) * 28;
    const ry = rx * 0.4;
    ctx.globalAlpha = progress < 0.75 ? 0.9 : 0.5;
    ctx.fillStyle = rung(def, RAMP_BASE + 1);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSmiteTint(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Frames 1-3 (progress > 0.25) — a SUSTAINED wash, unlike bolt's brief
  // 2-frame flash: the character is standing in the beam for the back
  // three-quarters of the effect, not just catching a passing strike. Frame
  // 0 (still descending, hasn't reached the character yet) paints nothing.
  // `base` rung (not hot) — a lingering wash reads better at the mid
  // brightness than a sustained hot-rung flash would.
  if (progress <= 0.25) return;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = base(def);
  ctx.beginPath();
  ctx.ellipse(
    cx,
    cy - GROUND_TINT_Y_OFFSET,
    GROUND_TINT_RX,
    GROUND_TINT_RY,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

// `rockfall`: 3 rocks descending and impacting, staggered so they don't land
// together. Each rock trails a short tapering MOTION STREAK while it falls —
// the single most important detail in this task. Four frames is very little
// runway for a fall (progress is exactly 0.125/0.375/0.625/0.875, sampled at
// each frame's midpoint — see frameProgress in render.ts), and without the
// streak a falling rock reads as a jump-cut between four disconnected
// positions rather than as travel. The streak is filled, not stroked, so it
// survives quantisation at this raster size the way a thin stroke sometimes
// doesn't (see the note above drawChains about strokes vanishing under
// quantizeToRamp at low pixel counts).
//
// Each rock has its own [topOffset, landProgress, fallDuration] profile
// (ROCKFALL_PROFILE), NOT one shared closed form — a hand-tuned table, not
// indexFrac jitter, staggered so the three rocks read as separate falls
// rather than one synchronized drop:
//   rock 0 — short/close (topOffset 70): already mid-fall and BELOW the
//     `behind` cutoff on frame 0, landing on frame 1. Guarantees `front`
//     content from frame 0 onward.
//   rock 1 — full height (topOffset 150): lands on frame 2, the "middle"
//     rock, crossing from `behind` to `front` partway through.
//   rock 2 — full height (topOffset 150), landing LAST, on frame 3
//     (landProgress 0.875, the final sampled progress value). It stays put
//     through frame 0 (its fallDuration-0.5 window doesn't open until
//     progress 0.375), then descends smoothly across the remaining three
//     samples — 150 -> 150 -> 75 -> 0 — landing exactly on the last frame,
//     the same "reads as travel, not a jump" shape as rocks 0 and 1.
//
// An earlier version pinned rock 2's landProgress past the sampled range
// entirely (1.5, with a matching 1.5 fallDuration) specifically so it would
// NEVER land on screen — the reasoning at the time was that a `behind`-empty
// frame at the end of the clip would read as a stutter. That reasoning was
// wrong, and over-general: it treated ANY empty layer-frame as a defect,
// when in fact once all three rocks have landed there genuinely IS nothing
// left behind the character to draw. An empty `behind` layer on frame 3,
// sitting alongside a populated `front` layer (three landed rocks plus
// their impact puffs), is the CORRECT steady state for that moment, not a
// bug — keeping rock 2 permanently airborne to dodge it just bought a rock
// that visibly never finishes falling, in exchange for avoiding a non-
// problem. (There was never a committed assertion enforcing "every frame
// paints something in every layer" to relax here, either — that check only
// ever lived in throwaway per-task verification scripts, not in the repo.)
//
// Horizontal position is still index-derived (rockHOffset) and every rock's
// silhouette/streak jitter is index-derived (drawRockShape) — only these
// three timing numbers per rock are a fixed table.
const ROCKFALL_COUNT = 3;
const ROCKFALL_ROCK_R = 9;
const ROCKFALL_STREAK_LEN = 26;
const ROCKFALL_BEHIND_CUTOFF = 40; // rocks above cy - this draw in `behind`, at/below it in `front`

// [topOffset, landProgress, fallDuration] per rock — see the module comment
// above for why these specific numbers, not indexFrac jitter.
const ROCKFALL_TOP_OFFSET: readonly number[] = [70, 150, 150];
const ROCKFALL_LAND_PROGRESS: readonly number[] = [0.375, 0.625, 0.875];
const ROCKFALL_FALL_DURATION: readonly number[] = [0.5, 0.5, 0.5];

// Rock i's landing progress — 0.375/0.625/0.875 for rocks 0/1/2, i.e. frames
// 1/2/3 respectively (see the module comment above for why rock 2 lands
// last, on the final sampled frame, instead of never landing at all).
function rockLandProgress(i: number): number {
  return ROCKFALL_LAND_PROGRESS[i] as number;
}

// Fixed horizontal slot per rock (-28/0/+28), jittered by the index so the
// row doesn't look mechanically even. Max |offset| = 28 + 6 = 34; combined
// with the rock's own radius (<=10.8) that's ~45px, comfortably inside the
// 62px horizontal budget.
function rockHOffset(i: number): number {
  return (i - 1) * 28 + (indexFrac(i * 9 + 4) - 0.5) * 12;
}

// How far ABOVE cy rock i sits at a given progress: its own topOffset
// before it starts falling, 0 once it has landed, linearly in between.
function rockFallOffset(i: number, progress: number): number {
  const top = ROCKFALL_TOP_OFFSET[i] as number;
  const landP = rockLandProgress(i);
  const duration = ROCKFALL_FALL_DURATION[i] as number;
  const t = (landP - progress) / duration;
  return top * Math.max(0, Math.min(1, t));
}

// Small irregular polygon (4 or 5 sides, alternating by rock index) so a
// rock reads as an angular chunk of stone rather than a ball. Vertex angle
// and radius jitter derive from the rock index + vertex index via
// indexFrac — never Math.random — so the same rock always looks the same.
function drawRockShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  i: number,
): void {
  const sides = i % 2 === 0 ? 5 : 4;
  ctx.beginPath();
  for (let v = 0; v < sides; v++) {
    const angle = (v / sides) * Math.PI * 2 + (indexFrac(i * 19 + v * 7) - 0.5);
    const r = ROCKFALL_ROCK_R * (0.7 + indexFrac(i * 13 + v * 5) * 0.5);
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (v === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fill();
}

// THE MOTION STREAK: a short tapering wedge trailing upward from the rock's
// current position — wide at the rock, narrowing to a point above it. Only
// drawn while the rock is strictly BETWEEN its waiting-at-top and landed
// states (0 < fallOffset < ROCKFALL_TOP_OFFSET): a rock that hasn't started
// falling yet, or has already landed, isn't moving, so it gets no streak.
// On every frame where a rock IS mid-fall, this is what implies the travel
// between that frame and the next.
function drawRockStreak(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  const halfWidth = ROCKFALL_ROCK_R * 0.4;
  ctx.beginPath();
  ctx.moveTo(x - halfWidth, y);
  ctx.lineTo(x + halfWidth, y);
  ctx.lineTo(x, y - ROCKFALL_STREAK_LEN);
  ctx.closePath();
  ctx.fill();
}

// Shared by drawRockfallBehind/Front: paints every rock (+ streak) whose
// current position belongs to the requested layer. `behind` = still above
// roughly the character's head (cy - ROCKFALL_BEHIND_CUTOFF, "up near the
// character's head" per the brief); `front` = at or below that, i.e. close
// enough to the ground to read as in front of the character. A rock crosses
// from one layer to the other between frames (there is no mid-frame to
// crossfade through) — the streak on the frame before the crossing plus the
// rock's new position after it is what sells the crossing as continuous
// travel rather than a swap.
function drawRockfallRocks(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
  wantBehind: boolean,
): void {
  ctx.fillStyle = wantBehind ? base(def) : rung(def, RAMP_BASE + 1);
  for (let i = 0; i < ROCKFALL_COUNT; i++) {
    const top = ROCKFALL_TOP_OFFSET[i] as number;
    const fallOffset = rockFallOffset(i, progress);
    const isBehind = fallOffset > ROCKFALL_BEHIND_CUTOFF;
    if (isBehind !== wantBehind) continue;

    const x = cx + rockHOffset(i);
    const y = cy - fallOffset;

    if (fallOffset > 0 && fallOffset < top) {
      ctx.globalAlpha = wantBehind ? 0.55 : 0.75;
      drawRockStreak(ctx, x, y);
    }
    ctx.globalAlpha = wantBehind ? 0.85 : 1;
    drawRockShape(ctx, x, y, i);
  }
}

function drawRockfallBehind(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  drawRockfallRocks(ctx, progress, def, cx, cy, true);
}

function drawRockfallFront(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  drawRockfallRocks(ctx, progress, def, cx, cy, false);

  // Impact puffs: a brief flash at the ground under each rock, on the frame
  // it lands and the frame after (fading), then gone — not a static puff
  // that lingers for the rest of the effect once a rock has landed.
  ctx.fillStyle = rung(def, RAMP_BASE + 1);
  for (let i = 0; i < ROCKFALL_COUNT; i++) {
    const framesSinceLand = Math.round((progress - rockLandProgress(i)) / 0.25);
    let alpha = 0;
    if (framesSinceLand === 0) alpha = 1;
    else if (framesSinceLand === 1) alpha = 0.4;
    if (alpha <= 0) continue;

    const x = cx + rockHOffset(i);
    const rx = 9;
    const ry = rx * 0.4;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRockfallTint(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // A brief flash on the frame a rock lands, gated to the middle of the
  // clip like drawBoltTint (0.25 < progress < 0.75, i.e. frames 1-2 only).
  // Rocks 0/1 land inside that window (0.375/0.625 — rockLandProgress) and
  // get the flash. Rock 2 now lands too (frame 3, progress 0.875 — see the
  // module comment above drawRockShape) but that's past this gate, so its
  // landing gets no tint flash — it still gets its own impact puff in
  // drawRockfallFront, which isn't gated the same way. No draw call at all
  // when off, same convention as drawShockwaveTint/drawBoltTint.
  if (progress <= 0.25 || progress >= 0.75) return;
  ctx.globalAlpha = 1;
  ctx.fillStyle = rung(def, RAMP_BASE + 1);
  ctx.beginPath();
  ctx.ellipse(
    cx,
    cy - GROUND_TINT_Y_OFFSET,
    GROUND_TINT_RX,
    GROUND_TINT_RY,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

// `ring-of-fire`: a sustained, standing ground ring at a FIXED radius — it
// does not expand like `ring`/`shockwave` — with flame tongues flickering
// off the band and a quantised centre wash so the character reads as
// standing ON burning ground, not under it. Uses GROUND_FRAME (128x128,
// ground point (64, 64), no body lift), not TALL_FRAME: this is a loop
// (`loops: 3` in SET_PIECES, registry.ts), not a descent, so it has no need
// of the extra headroom. Budget is the plain GROUND_FRAME one: <= 62px in
// every direction from (cx, cy).
//
// `behind`/`front` split the ring band AND the tongues into far/near halves
// exactly like drawRingBehind/drawRingFront and drawShockwaveBehind/Front
// above — same angle ranges ([PI, 2*PI] for the far/top half, [0, PI] for
// the near/bottom half), reused rather than re-derived. The centre fill
// (drawRingOfFireCentreFill, below) is NOT split this way: it paints the
// FULL interior ellipse, but ONLY from drawRingOfFireBehind. Being entirely
// on the `behind` layer means the whole fill composites under the character
// sprite regardless of which half of the ellipse a given pixel
// geometrically belongs to — that's what puts the character standing ON
// the fire instead of the (near) flames drawing over their legs. No `tint`
// layer: a sustained ground ring composited 3 loops running would strobe
// the character three times if it had one, so `tint` is left out of
// KINDS['ring-of-fire'].draw entirely — the centre fill is what gives the
// ground its glow instead, without the strobe.
//
// LOOP SEAMLESSNESS: the ring's alpha flicker, the tongues' height
// oscillation, and the centre fill's alpha flicker are all driven by
// `ringOfFireFlicker(progress)` = `progress * Math.PI * 2` — an INTEGER (1)
// cycle per loop — optionally plus a CONSTANT per-tongue phase offset. The
// four sampled progress values (0.125/0.375/0.625/0.875) sit at exactly
// 45/135/225/315 degrees of phase, i.e. evenly spaced 90 degrees apart — so
// the step from the last frame of one loop (315deg) back to the first frame
// of the next (effectively 405deg, i.e. 45deg again) is the SAME 90deg step
// as every other inter-frame gap, for ANY fixed phase offset (a constant
// offset just relabels which point in the same 4-state cycle is "frame 0").
// Nothing distinguishes "loop wrapped" from "advanced one frame normally",
// which is what makes the repeat invisible. A non-integer coefficient (or a
// coefficient that isn't exactly 1 full cycle per loop) would make the wrap
// step a different size than the others, reading as a visible pop every
// 3rd-of-a-second.
const RING_OF_FIRE_RX = 38; // fixed — does not grow with progress
const RING_OF_FIRE_RY_FACTOR = 0.42;
const RING_OF_FIRE_LINE_WIDTH = 3;
const RING_OF_FIRE_TONGUE_COUNT = 10;
const RING_OF_FIRE_TONGUE_BASE_H = 12;
const RING_OF_FIRE_TONGUE_AMP = 24;
const RING_OF_FIRE_TONGUE_HALF_WIDTH = 4;
// Lean and per-tongue phase are both derived from indexFrac (see its doc
// comment: `i * 2.399`, a golden-angle-style scatter), but at DIFFERENT
// multipliers of the tongue index — and for phase, a multiplier chosen to
// dodge a resonance with that 2.399 constant. `5 * 2.399 = 11.995`, i.e.
// almost exactly 12: an integer. Since indexFrac keeps only the FRACTIONAL
// part, stepping its argument by a near-integer multiple of 1 barely moves
// the result — `indexFrac(i * 5 + 1)` (this file's previous formula here)
// produced 10 phases all within a 0.045-of-a-turn band, a near-unison pulse
// wearing an index-derived disguise, which is exactly the "pattern, not
// fire" bug reported after this shipped. `18 * 2.399 = 43.182`, fractional
// part 0.182 — nowhere near a resonance — and empirically (brute-force
// checked over multipliers 1-60 against RING_OF_FIRE_TONGUE_COUNT, scoring
// on worst-case pairwise circular separation) is the best achievable spread
// for exactly 10 tongues: every pair at least ~32 degrees apart, close to
// the theoretical ideal of 36 degrees (360/10) for perfectly even points.
// Do not "simplify" this back to a small multiplier.
const RING_OF_FIRE_TONGUE_PHASE_MULT = 18;
const RING_OF_FIRE_TONGUE_LEAN_MULT = 3;
const RING_OF_FIRE_TONGUE_LEAN_RANGE = 6; // +/- 3px

function ringOfFireRadii(): { rx: number; ry: number } {
  return { rx: RING_OF_FIRE_RX, ry: RING_OF_FIRE_RX * RING_OF_FIRE_RY_FACTOR };
}

// One flicker clock shared by the tongues and the centre fill — no
// per-tongue offset here, that's layered on separately where needed. This
// IS "the same phase source" the centre fill's doc comment promises
// relative to the tongues.
function ringOfFireFlicker(progress: number): number {
  return progress * Math.PI * 2;
}

// A tapered flame silhouette, four points wound base-left -> base-right ->
// shoulder -> tip: a flat base where it meets the band, one side bulging
// into a "shoulder" partway up (the asymmetric flare that reads as a lick
// rather than a plain wedge), then pulling in to a point that leans
// outward by `lean`. The shoulder sits further from centre (in x) than the
// tip across this file's whole parameter range, which keeps the polygon
// simple (no self-crossing edges).
function drawFlameTongue(
  ctx: CanvasRenderingContext2D,
  baseX: number,
  baseY: number,
  height: number,
  lean: number,
): void {
  const hw = RING_OF_FIRE_TONGUE_HALF_WIDTH;
  ctx.beginPath();
  ctx.moveTo(baseX - hw, baseY);
  ctx.lineTo(baseX + hw, baseY);
  ctx.lineTo(baseX + hw * 0.5 + lean * 0.4, baseY - height * 0.55);
  ctx.lineTo(baseX + lean, baseY - height);
  ctx.closePath();
  ctx.fill();
}

// Tongues rising from the band at index-derived angles, split into the same
// far/near halves as the ring itself. See the loop-seamlessness note above
// this section for why the height oscillation is safe to wrap.
function drawRingOfFireTongues(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
  wantBehind: boolean,
): void {
  const { rx, ry } = ringOfFireRadii();
  ctx.fillStyle = rung(def, RAMP_BASE + 1);
  const flicker = ringOfFireFlicker(progress);
  for (let i = 0; i < RING_OF_FIRE_TONGUE_COUNT; i++) {
    const angle = (i / RING_OF_FIRE_TONGUE_COUNT) * Math.PI * 2;
    const isBehind = angle >= Math.PI;
    if (isBehind !== wantBehind) continue;

    const baseX = cx + Math.cos(angle) * rx;
    const baseY = cy + Math.sin(angle) * ry;
    // Per-tongue phase offset so they flicker independently instead of in
    // unison — see RING_OF_FIRE_TONGUE_PHASE_MULT's doc comment above for
    // why 18 (not a small multiplier) is load-bearing here. A constant
    // added phase doesn't change the loop-wrap periodicity (see the note
    // above), so this is safe to derive from the index.
    const phase =
      indexFrac(i * RING_OF_FIRE_TONGUE_PHASE_MULT + 1) * Math.PI * 2;
    const height =
      RING_OF_FIRE_TONGUE_BASE_H +
      RING_OF_FIRE_TONGUE_AMP * (0.5 + 0.5 * Math.sin(flicker + phase));
    const lean =
      (indexFrac(i * RING_OF_FIRE_TONGUE_LEAN_MULT + 2) - 0.5) *
      RING_OF_FIRE_TONGUE_LEAN_RANGE;
    ctx.globalAlpha = 0.85;
    drawFlameTongue(ctx, baseX, baseY, height, lean);
  }
}

// Interior wash: a quantised fill covering most of the ring's footprint,
// AUTHORED at the "base" rung (see `base(def)` below, and palette.ts's Ramp
// doc comment for the shadow/mid/base/hot order) but at alpha 0.45-0.75 the
// quantiser (quantizeToRamp) resolves it one or two rungs DULLER than
// authored, and which rung it lands on varies per element — measured:
// `neutral` swings base<->mid, `fire`/`water`/`earth` swing mid<->shadow,
// `wind`/`light` sit steady on mid, `dark` sits steady on shadow. Don't
// assume "authored at X" means "renders at X" here; it doesn't. It flickers
// off the SAME clock as the tongues (ringOfFireFlicker) but at a
// visibly smaller amplitude (0.15 vs the band's 0.3) — a gentler pulse
// under the flame licks, not a second set of flames. `behind` ONLY (see the
// big comment above this section): painting this from drawRingOfFireFront
// too would put burning ground in front of the character's legs instead of
// under their feet.
const RING_OF_FIRE_FILL_RADIUS_FACTOR = 0.8; // fraction of the band's rx/ry
const RING_OF_FIRE_FILL_ALPHA_BASE = 0.6;
const RING_OF_FIRE_FILL_ALPHA_AMP = 0.15;

function drawRingOfFireCentreFill(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const { rx, ry } = ringOfFireRadii();
  ctx.globalAlpha =
    RING_OF_FIRE_FILL_ALPHA_BASE +
    RING_OF_FIRE_FILL_ALPHA_AMP * Math.sin(ringOfFireFlicker(progress));
  ctx.fillStyle = base(def);
  ctx.beginPath();
  ctx.ellipse(
    cx,
    cy,
    rx * RING_OF_FIRE_FILL_RADIUS_FACTOR,
    ry * RING_OF_FIRE_FILL_RADIUS_FACTOR,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

function drawRingOfFireBehind(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Ground glow first — painter's-algorithm base layer. Paint order is
  // harmless under the 'lighter'/additive composite ring-of-fire uses (see
  // registry.ts's set-piece build loop, which hardcodes `additive: true`
  // for every set-piece def — NOT this file's FLOW_TIMING below, whose own
  // `additive` field is never read for set-piece kinds; see the module note
  // above KINDS for why): summing is commutative, so this could legally go
  // last too. It's placed first because it's logically the "ground" the
  // band and tongues sit on top of.
  drawRingOfFireCentreFill(ctx, progress, def, cx, cy);

  // Far arc — same half-split as drawRingBehind/drawShockwaveBehind above,
  // just at a fixed (non-expanding) radius. Alpha flickers gently instead of
  // fading with progress — a standing ring, not an impact.
  const { rx, ry } = ringOfFireRadii();
  ctx.globalAlpha = 0.7 + 0.3 * Math.sin(ringOfFireFlicker(progress));
  ctx.lineWidth = RING_OF_FIRE_LINE_WIDTH;
  ctx.strokeStyle = base(def);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.stroke();

  drawRingOfFireTongues(ctx, progress, def, cx, cy, true);
}

function drawRingOfFireFront(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Near arc, drawn over the character's feet. Same flicker as the far arc.
  // No centre fill here — see the big comment above this section: the fill
  // is `behind`-only by design.
  const { rx, ry } = ringOfFireRadii();
  ctx.globalAlpha = 0.7 + 0.3 * Math.sin(ringOfFireFlicker(progress));
  ctx.lineWidth = RING_OF_FIRE_LINE_WIDTH;
  ctx.strokeStyle = base(def);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.stroke();

  drawRingOfFireTongues(ctx, progress, def, cx, cy, false);
}

// ---- cleave ---------------------------------------------------------------
// A straight diagonal CUT. Not an arc, and not a literal blade.
//
// The first version swept a thick round-capped band along a circle of radius
// 33, and it read as a fireball bouncing past rather than a sword stroke —
// correctly, because that is what it was: a fat leading edge travelling a
// curved track is a ball on a rail however it is coloured, and `lineCap:
// 'round'` made the head literally circular. The taper worked against it too,
// putting the widest point at the leading end.
//
// So the shape is now a filled LENS: pointed at both tips, thickest at the
// middle, lying on a straight diagonal. Filling a pointed path is what kills
// the round cap, and the round cap is where "ball" came from. It stops being
// a thing that travels and becomes a cut that is simply there.
//
// Still not a literal blade — at 44x44 internal on four rungs a sword
// mid-swing resolves to a bright stick (`swordfall` gets a real blade because
// TALL_FRAME gives it 44x88 to work with). And still distinct from the `slash`
// matrix kind, which is a thin single arc stroke with no mass (drawSlash,
// unchanged).

/** Frames the registry allots to ONE cleave. `cycleMode: 'frames'` multiplies
 *  SET_PIECES.cleave.frames by the cycle count, so this is how a draw call
 *  recovers how many cleaves it is part of. Asserted equal to the registry's
 *  base frame count in scripts/vfx-registry-check.ts. */
export const CLEAVE_FRAMES_PER_CYCLE = 4;

/** The two diagonals, in canvas radians (y grows DOWNWARD, so a positive
 *  angle descends): DOWN_RIGHT runs top-left to bottom-right, DOWN_LEFT is its
 *  mirror. Expressing the mirror as a second angle rather than a ctx.scale(-1)
 *  is what lets this kind hold to the module's no-transform convention. */
const CLEAVE_DOWN_RIGHT = 0.25 * Math.PI;
const CLEAVE_DOWN_LEFT = 0.75 * Math.PI;

const CLEAVE_HALF_LENGTH = 50;
const CLEAVE_HALF_WIDTH = 6;
// Extent: worst case is the TINT layer, which passes widthScale 2. A lens on a
// 45-degree diagonal reaches (CLEAVE_HALF_LENGTH + CLEAVE_HALF_WIDTH * 2) /
// sqrt(2) = 43.8 design-px along each axis, against the square frame's <=62
// half-budget. behind (widthScale 1.5) is 41.7; front (1) is 39.6.

/** Which cleave of the flurry `progress` falls in, and how far through it.
 *
 *  Cycle geometry is derived from the cycle INDEX arithmetically — never
 *  through indexFrac. indexFrac's own 2.399 constant aliased ring-of-fire's
 *  ten tongues into a 16.2 degree band while looking independent in source;
 *  that bug is not worth repeating for three values. */
function cleavePhase(
  def: VfxDef,
  progress: number,
): { t: number; index: number } {
  const count = Math.max(1, Math.round(def.frames / CLEAVE_FRAMES_PER_CYCLE));
  const scaled = progress * count;
  // Math.min guards the progress === 1 endpoint. frameProgress samples frame
  // midpoints so it never actually reaches 1, but drawEffectAt is also called
  // directly by the aio-editor preview's scrubber.
  const index = Math.min(count - 1, Math.floor(scaled));
  return { t: scaled - index, index };
}

/** The combo: cut 1 down-right, cut 2 down-left, cut 3 BOTH at once — an X.
 *
 *  The third cut differs STRUCTURALLY rather than by angle, which is what
 *  stops `-x3` reading as a stutter. The previous version rotated cut 3 just
 *  36 degrees off cut 1, so once the mirrored second cut had been and gone the
 *  third simply echoed the first. `-x2` was always fine because two opposed
 *  diagonals are a genuine X; `-x3` now escalates to that X landing at once. */
function cleaveCut(index: number): { downRight: boolean; downLeft: boolean } {
  return { downRight: index !== 1, downLeft: index !== 0 };
}

/** Fills one lens along `angle`: pointed at both tips, thickest at the middle.
 *  Strokes nothing — a stroked path gets caps, and a cap is what made the old
 *  arc read as a projectile head. */
function cleaveLens(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  t: number,
  colour: string,
  widthScale: number,
  alphaScale: number,
): void {
  // A cut is already there by the time you see it, so it opens most of the way
  // on its first frame and then holds. Growing it in evenly would read as a
  // beam being extruded rather than a blade passing through.
  const grow = Math.min(1, 0.55 + t * 1.8);
  const fade = t < 0.4 ? 1 : 1 - ((t - 0.4) / 0.6) * 0.85;

  const halfLen = CLEAVE_HALF_LENGTH * grow;
  const halfWid = CLEAVE_HALF_WIDTH * widthScale;
  const ax = Math.cos(angle) * halfLen;
  const ay = Math.sin(angle) * halfLen;
  // Control points sit at TWICE the intended mid-width: a quadratic Bezier
  // passes through the midpoint of (chord midpoint, control point), so it only
  // reaches half way to its control. Using halfWid directly would draw a lens
  // half as thick as every extent number in this section assumes.
  const px = -Math.sin(angle) * halfWid * 2;
  const py = Math.cos(angle) * halfWid * 2;

  ctx.globalAlpha = fade * alphaScale;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(cx + ax, cy + ay);
  ctx.quadraticCurveTo(cx + px, cy + py, cx - ax, cy - ay);
  ctx.quadraticCurveTo(cx - px, cy - py, cx + ax, cy + ay);
  ctx.closePath();
  ctx.fill();
  // globalAlpha is the one non-default this leaves behind; restore it for the
  // combo layer that may be painted straight after (module header convention).
  ctx.globalAlpha = 1;
}

/** Draws whichever diagonals the current cut calls for — one, or both for the
 *  X finisher. Shared by all three depth layers, which differ only in colour,
 *  width and alpha. */
function cleaveCuts(
  ctx: CanvasRenderingContext2D,
  def: VfxDef,
  progress: number,
  cx: number,
  cy: number,
  colour: string,
  widthScale: number,
  alphaScale: number,
): void {
  const { t, index } = cleavePhase(def, progress);
  const cut = cleaveCut(index);
  if (cut.downRight) {
    cleaveLens(
      ctx,
      cx,
      cy,
      CLEAVE_DOWN_RIGHT,
      t,
      colour,
      widthScale,
      alphaScale,
    );
  }
  if (cut.downLeft) {
    cleaveLens(
      ctx,
      cx,
      cy,
      CLEAVE_DOWN_LEFT,
      t,
      colour,
      widthScale,
      alphaScale,
    );
  }
}

function drawCleaveBehind(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Wider and dimmer than the front core, so the cut's body reads as passing
  // BEHIND the target rather than sitting flat across it.
  cleaveCuts(ctx, def, progress, cx, cy, base(def), 1.5, 0.45);
}

function drawCleaveTint(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Additive bloom onto the target. Low alpha: the tint layer is composited
  // `add` regardless of def.additive, so anything heavy here blows out.
  cleaveCuts(ctx, def, progress, cx, cy, rung(def, RAMP_BASE + 1), 2, 0.3);
}

function drawCleaveFront(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  cleaveCuts(ctx, def, progress, cx, cy, rung(def, RAMP_BASE + 1), 1, 1);

  // Hot core down the spine of the cut — the edge itself. Thin enough that the
  // quantiser keeps it a line instead of merging it into the body.
  //
  // This replaces the old travelling spark at the arc's leading point, which
  // was doing more than its share of the "fireball" impression: a bright round
  // head at the front of a moving shape reads as a projectile no matter what
  // trails behind it. A cut has an edge, not a nose.
  cleaveCuts(ctx, def, progress, cx, cy, rung(def, RAMP_BASE + 2), 0.35, 1);
}

// ---- swordfall ------------------------------------------------------------
// Unlike cleave, the blade here IS literal: TALL_FRAME rasterises 44x88, and
// the vertical room is enough for a readable silhouette. It descends
// point-down, plants in the ground, and throws an impact ring.

const SWORDFALL_BLADE_LEN = 84;
const SWORDFALL_BLADE_HALF_W = 5;
const SWORDFALL_GUARD_HALF_W = 15;
const SWORDFALL_GUARD_H = 5;
const SWORDFALL_GRIP_H = 20;
const SWORDFALL_GRIP_HALF_W = 3;
const SWORDFALL_POMMEL_R = 4;

/** Planted height above the ground point: tip at cy, pommel top at
 *  cy - SWORDFALL_TOTAL_HEIGHT. Asserted against TALL_FRAME.groundY in
 *  scripts/vfx-registry-check.ts. */
export const SWORDFALL_TOTAL_HEIGHT =
  SWORDFALL_BLADE_LEN +
  SWORDFALL_GUARD_H +
  SWORDFALL_GRIP_H +
  SWORDFALL_POMMEL_R * 2;

/** How far above the ground the tip starts. Larger than the headroom on
 *  purpose: on the first frame the BLADE ITSELF is clipped by the frame
 *  edge (the hilt is entirely off-frame, further above still), which reads
 *  as the sword entering from off-screen. Frame 1 — the worst DESCENT
 *  frame — is separately asserted fully on-screen in
 *  scripts/vfx-registry-check.ts; the extent assertion next to
 *  SWORDFALL_TOTAL_HEIGHT only covers the PLANTED frames, so it says
 *  nothing about the descent on its own. */
export const SWORDFALL_START_ABOVE = 150;
const SWORDFALL_LAND_PROGRESS = 0.5;

/** Tip offset above the ground point, and whether the blade has planted. */
function swordfallTip(progress: number): { above: number; planted: boolean } {
  if (progress >= SWORDFALL_LAND_PROGRESS) return { above: 0, planted: true };
  const fall = progress / SWORDFALL_LAND_PROGRESS;
  // Accelerating fall — a linear descent reads as a lift, not a drop.
  return { above: SWORDFALL_START_ABOVE * (1 - fall * fall), planted: false };
}

/** The sword itself, tip at (cx, cy - above), pointing down. */
function swordfallBlade(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  above: number,
  colour: string,
  alpha: number,
): void {
  const tipY = cy - above;
  const guardY = tipY - SWORDFALL_BLADE_LEN;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;

  // Blade: a tapered quad from the point up to the guard.
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.lineTo(cx + SWORDFALL_BLADE_HALF_W, guardY);
  ctx.lineTo(cx - SWORDFALL_BLADE_HALF_W, guardY);
  ctx.closePath();
  ctx.fill();

  // Crossguard.
  ctx.fillRect(
    cx - SWORDFALL_GUARD_HALF_W,
    guardY - SWORDFALL_GUARD_H,
    SWORDFALL_GUARD_HALF_W * 2,
    SWORDFALL_GUARD_H,
  );

  // Grip.
  ctx.fillRect(
    cx - SWORDFALL_GRIP_HALF_W,
    guardY - SWORDFALL_GUARD_H - SWORDFALL_GRIP_H,
    SWORDFALL_GRIP_HALF_W * 2,
    SWORDFALL_GRIP_H,
  );

  // Pommel.
  ctx.beginPath();
  ctx.arc(
    cx,
    guardY - SWORDFALL_GUARD_H - SWORDFALL_GRIP_H - SWORDFALL_POMMEL_R,
    SWORDFALL_POMMEL_R,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.globalAlpha = 1;
}

function drawSwordfallBehind(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const { planted } = swordfallTip(progress);
  if (!planted) return;

  // Dust wedge kicked up behind the impact. An empty `behind` frame before
  // the blade lands is CORRECT — there is nothing behind the character yet.
  // Do not "fix" it by painting something on the descent frames; the same
  // conclusion rockfall's third landing reached.
  const age =
    (progress - SWORDFALL_LAND_PROGRESS) / (1 - SWORDFALL_LAND_PROGRESS);
  const spread = 14 + age * 22;
  ctx.globalAlpha = 0.55 * (1 - age);
  ctx.fillStyle = base(def);
  ctx.beginPath();
  ctx.moveTo(cx - spread, cy);
  ctx.lineTo(cx + spread, cy);
  ctx.lineTo(cx + spread * 0.4, cy - 20 - age * 14);
  ctx.lineTo(cx - spread * 0.4, cy - 20 - age * 14);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawSwordfallTint(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  // Bloom along the blade. Composited `add` regardless of def.additive, so
  // keep it faint — see SkillBurst's constructor comment.
  const { above } = swordfallTip(progress);
  swordfallBlade(ctx, cx, cy, above, rung(def, RAMP_BASE + 1), 0.35);
}

function drawSwordfallFront(
  ctx: CanvasRenderingContext2D,
  progress: number,
  def: VfxDef,
  cx: number,
  cy: number,
): void {
  const { above, planted } = swordfallTip(progress);
  swordfallBlade(ctx, cx, cy, above, rung(def, RAMP_BASE + 1), 1);

  if (!planted) return;

  // Impact ring, expanding and fading from the moment of landing.
  const age =
    (progress - SWORDFALL_LAND_PROGRESS) / (1 - SWORDFALL_LAND_PROGRESS);
  const rx = 12 + age * 26;
  ctx.globalAlpha = 0.9 * (1 - age);
  ctx.strokeStyle = rung(def, RAMP_BASE + 2);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, rx * 0.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1;
}

// Impacts: short, punchy hits. A single 4-frame cycle, no repeat —
// 4 * 1 * 100ms = 400ms. Looping an impact reads as sluggish (see the
// module-level cadence note below), so these get the minimum loop count.
const IMPACT_TIMING = {
  frames: 4,
  loops: 1,
  frameMs: 100,
  additive: true,
} as const;
// Sustained/looping-feel effects: the same 4-frame cycle repeated 3x reads
// as ongoing magic rather than a one-shot flourish — 4 * 3 * 100ms = 1200ms.
const FLOW_TIMING = {
  frames: 4,
  loops: 3,
  frameMs: 100,
  additive: true,
} as const;

export const KINDS: Record<ShapeKind, KindConfig> = {
  ring: {
    ...IMPACT_TIMING,
    draw: { behind: drawRingBehind, tint: drawRingTint, front: drawRingFront },
  },
  disc: { ...IMPACT_TIMING, draw: { front: drawDisc } },
  'spark-burst': { ...IMPACT_TIMING, draw: { front: drawSparkBurst } },
  slash: { ...IMPACT_TIMING, draw: { front: drawSlash } },
  nova: { ...IMPACT_TIMING, draw: { front: drawNova } },
  shockwave: {
    ...IMPACT_TIMING,
    draw: {
      behind: drawShockwaveBehind,
      tint: drawShockwaveTint,
      front: drawShockwaveFront,
    },
  },
  implode: { ...IMPACT_TIMING, draw: { front: drawImplode } },
  'burst-lines': { ...IMPACT_TIMING, draw: { front: drawBurstLines } },
  sparkle: { ...FLOW_TIMING, draw: { front: drawSparkle } },
  spiral: { ...FLOW_TIMING, draw: { front: drawSpiral } },
  vortex: { ...FLOW_TIMING, draw: { front: drawVortex } },
  orbit: { ...FLOW_TIMING, draw: { front: drawOrbit } },
  chains: { ...FLOW_TIMING, draw: { front: drawChains } },
  rain: { ...FLOW_TIMING, draw: { front: drawRain } },
  'beam-pop': { ...FLOW_TIMING, draw: { front: drawBeamPop } },

  // Set pieces (Task 4 plumbing; Tasks 5/6 supply real art). `frames`/
  // `loops`/`frameMs`/`additive` here are never read for these four kinds —
  // registry.ts's SET_PIECES table carries the authoritative cadence for
  // generated set-piece defs (matrix/combo generation, the only place that
  // reads a kind's own timing off KINDS, deliberately skips them; see
  // MATRIX_KINDS). They're populated anyway only because KindConfig requires
  // them.
  bolt: {
    ...IMPACT_TIMING,
    draw: { behind: drawBoltBehind, tint: drawBoltTint, front: drawBoltFront },
  },
  smite: {
    ...IMPACT_TIMING,
    draw: {
      behind: drawSmiteBehind,
      tint: drawSmiteTint,
      front: drawSmiteFront,
    },
  },
  rockfall: {
    ...IMPACT_TIMING,
    draw: {
      behind: drawRockfallBehind,
      tint: drawRockfallTint,
      front: drawRockfallFront,
    },
  },
  'ring-of-fire': {
    ...FLOW_TIMING,
    draw: {
      behind: drawRingOfFireBehind,
      front: drawRingOfFireFront,
    },
  },
  cleave: {
    ...IMPACT_TIMING,
    draw: {
      behind: drawCleaveBehind,
      tint: drawCleaveTint,
      front: drawCleaveFront,
    },
  },
  swordfall: {
    ...IMPACT_TIMING,
    draw: {
      behind: drawSwordfallBehind,
      tint: drawSwordfallTint,
      front: drawSwordfallFront,
    },
  },
};
