import { useEffect, useRef } from "react";

import {
  ARROW_CANVAS_SIZE,
  ARROW_SHAPES,
  ARROW_TRAILS,
  arrowFacings,
  DEFAULT_ARROW_SHAPE,
  drawArrowCanvas,
  drawMoteCanvas,
  moteJitter,
} from "../../vfx-engine";

// STYLING NOTE: this form is styled with explicit Tailwind `slate-*` colours.
// aio-editor's frontend does NOT use daisyUI, so semantic tokens like
// `border-primary` / `border-base-300` / `bg-base-300` emit NO CSS here — an
// earlier version of this picker used them and the selected state was
// therefore completely invisible: clicking a shape changed the value but
// nothing on screen moved. Selected-tile styling below matches VfxField's
// established convention (border-slate-100 + ring-2).
//
// Mirrors VfxField: a gallery of live previews rather than a dropdown, because
// the entire point is seeing the flaming arrow before choosing it.

const PREVIEW_SCALE = 2;
// Down-right, the facing that reads most clearly at a glance. arrowFacings
// always returns exactly 4 entries (see its doc comment), so index 0 is safe;
// the `!` is only to satisfy noUncheckedIndexedAccess.
//
// 32/16 are the iso half-tile width/height. The editor can't import eoweb's
// consts.ts, so these are hardcoded rather than derived from
// HALF_TILE_WIDTH/HALF_TILE_HEIGHT — only their 2:1 ratio matters for this
// preview, but if the tile size ever changes there, this will silently drift
// out of sync.
const FACING = arrowFacings(32, 16)[0]!;
// Unit travel vector for FACING, in the same design-px space as
// ARROW_CANVAS_SIZE and the ARROW_TRAILS constants below. A trail lays its
// motes back along the REVERSE of this vector.
const FACING_LEN = Math.hypot(FACING.dx, FACING.dy);
const UX = FACING.dx / FACING_LEN;
const UY = FACING.dy / FACING_LEN;

// Static canvas, so no trail can literally animate — instead the preview
// freezes the arrow mid-flight with its motes already laid out behind it
// (see the loop below), which reads as a trail with zero rAF.
//
// Room reserved behind the arrow for that frozen trail, in design px (i.e.
// before PREVIEW_SCALE). Worst case across all three ARROW_TRAILS kinds and
// all `steps` mote ages, the backward offset a mote can reach is ~27.4px
// along x and ~16.3px along y (checked numerically against the loop's own
// formula) — 20 leaves a comfortable margin without the canvas ballooning.
// ARROW_CANVAS_SIZE itself is untouched: it's the game's sprite size, and
// changing it would shift every arrow's centre in the actual game.
const TRAIL_MARGIN = 20;
const PREVIEW_CANVAS_SIZE = ARROW_CANVAS_SIZE + TRAIL_MARGIN;

function ShapePreview({ shapeId }: { shapeId: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    // noUncheckedIndexedAccess: narrow ONCE here and reuse this binding
    // below — a second `ARROW_SHAPES[shapeId]` read would come back
    // `ArrowShapeDef | undefined` again and not compile against `.trail`.
    const shape = ARROW_SHAPES[shapeId];
    if (!shape) return;
    const art = drawArrowCanvas(
      shapeId,
      shape.defaultElement,
      FACING.dx,
      FACING.dy,
    );
    const ctx = host.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, host.width, host.height);

    // Everything below is drawn in design-px units under one ctx.scale, so
    // the arrow art and the mote offsets share a coordinate system without
    // re-deriving PREVIEW_SCALE math per draw call.
    ctx.save();
    ctx.scale(PREVIEW_SCALE, PREVIEW_SCALE);

    // Offset toward the leading (down-right) corner of the widened canvas —
    // its bottom-right edges touch the arrow's own edges exactly as they did
    // in the unwidened canvas — leaving TRAIL_MARGIN of empty space up-left,
    // behind the direction of travel, for the trail. Shapes with no trail
    // just leave that space empty; the arrow itself is drawn at its normal,
    // unstretched size, so it renders identically to before.
    ctx.drawImage(art, TRAIL_MARGIN, TRAIL_MARGIN);

    if (shape.trail) {
      const trailKind = shape.trail;
      const def = ARROW_TRAILS[trailKind];
      const mote = drawMoteCanvas(trailKind, shape.defaultElement);
      const originX = TRAIL_MARGIN + ARROW_CANVAS_SIZE / 2;
      const originY = TRAIL_MARGIN + ARROW_CANVAS_SIZE / 2;
      // A frozen mid-flight pose: motes laid back along the reverse of the
      // travel direction, each aged a little more than the one ahead of it,
      // so the fade and the drift both read without any animation.
      const steps = 7;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const ageMs = t * def.lifeMs;
        const j = moteJitter(i);
        // Back along the flight line, plus this mote's accumulated drift.
        const bx = -UX * (i * 5) + j.x * def.spread + def.driftX * ageMs;
        const by = -UY * (i * 5) + j.y * def.spread + def.driftY * ageMs;
        ctx.globalAlpha = Math.max(0, 1 - t * t);
        ctx.drawImage(mote, originX + bx, originY + by);
      }
      // Canvas2D context state is sticky — reset before returning, or every
      // later draw on this context (including the next shape's arrow, since
      // 2D contexts are commonly reused) inherits the last mote's fade.
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }, [shapeId]);
  return (
    <canvas
      ref={ref}
      width={PREVIEW_CANVAS_SIZE * PREVIEW_SCALE}
      height={PREVIEW_CANVAS_SIZE * PREVIEW_SCALE}
      className="rounded bg-slate-900"
    />
  );
}

export function ArrowKindPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const current = value || DEFAULT_ARROW_SHAPE;
  return (
    <div className="flex flex-wrap gap-2">
      {Object.keys(ARROW_SHAPES).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id === DEFAULT_ARROW_SHAPE ? "" : id)}
          className={`flex flex-col items-center gap-1 rounded border p-1 transition ${
            current === id
              ? "border-slate-100 bg-slate-700 ring-2 ring-slate-400/70"
              : "border-slate-600 hover:border-slate-400"
          }`}
          title={`${id} (default element: ${ARROW_SHAPES[id]!.defaultElement})`}
        >
          <ShapePreview shapeId={id} />
          <span
            className={`font-mono text-xs ${
              current === id ? "text-slate-100" : "text-slate-400"
            }`}
          >
            {id}
          </span>
        </button>
      ))}
    </div>
  );
}
