import { useEffect, useRef } from "react";

import {
  ARROW_CANVAS_SIZE,
  ARROW_SHAPES,
  ARROW_TRAILS,
  arrowFacings,
  DEFAULT_ARROW_SHAPE,
  drawArrowCanvas,
  drawMoteCanvas,
  moteAlpha,
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

// Geometry of the frozen-pose loop below: TRAIL_STEPS motes are laid back
// along the flight line, MOTE_STEP_PX design-px apart per step. Hoisted to
// module scope (rather than left as locals inside the loop) so the
// TRAIL_MARGIN derivation right below can reference the exact same numbers
// the loop draws with — two independent copies of "7" and "5" could drift
// apart silently.
const TRAIL_STEPS = 7;
const MOTE_STEP_PX = 5;

// TRAIL_MARGIN is DERIVED from ARROW_TRAILS, not hand-tuned, so a later
// retune of spread/drift/lifeMs can never silently clip the preview —
// Canvas2D draws off-canvas with no error or warning. For each trail kind,
// the worst-case distance a mote can land from the arrow's centre is the sum
// of:
//   - how far back along the flight line the LAST mote in the frozen pose
//     sits: (TRAIL_STEPS - 1) * MOTE_STEP_PX design px. Exact, not a bound —
//     UX/UY (the loop's travel unit vector) has magnitude 1.
//   - its spread jitter: exactly `spread`, since moteJitter always returns a
//     unit vector, so `(j.x * spread, j.y * spread)` has magnitude `spread`.
//   - its drift, generously bounded by a FULL lifeMs of accumulated drift
//     (hypot(driftX, driftY) * lifeMs) — looser than the loop's actual oldest
//     mote, which is aged only (TRAIL_STEPS - 1) / TRAIL_STEPS of lifeMs, on
//     purpose, for headroom.
// These three offsets don't necessarily point the same way, so summing their
// magnitudes is a safe (if slightly loose) upper bound on the true worst
// case, MEASURED FROM THE ARROW'S CENTRE.
//
// The canvas margin is not measured from the centre, though — the arrow art
// is blitted at (TRAIL_MARGIN, TRAIL_MARGIN), so its own centre already sits
// ARROW_CANVAS_SIZE / 2 inside the padded edge (see the drawImage call
// below). Subtracting that here is what turns a worst-case-from-centre
// distance into the actual pixels of margin still needed outside the arrow's
// own canvas; skipping it once padded every trail kind by a spurious extra
// 18px of dead space. +4px pad on top of that, then round up.
//
// ARROW_CANVAS_SIZE itself is untouched: it's the game's sprite size, and
// changing it would shift every arrow's centre in the actual game.
const TRAIL_MARGIN = Math.ceil(
  Math.max(
    ...Object.values(ARROW_TRAILS).map(
      (def) =>
        (TRAIL_STEPS - 1) * MOTE_STEP_PX +
        def.spread +
        Math.hypot(def.driftX, def.driftY) * def.lifeMs,
    ),
  ) +
    4 -
    ARROW_CANVAS_SIZE / 2,
);
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
      for (let i = 0; i < TRAIL_STEPS; i++) {
        const t = i / TRAIL_STEPS;
        const ageMs = t * def.lifeMs;
        const j = moteJitter(i);
        // Back along the flight line, plus this mote's accumulated drift.
        const bx =
          -UX * (i * MOTE_STEP_PX) + j.x * def.spread + def.driftX * ageMs;
        const by =
          -UY * (i * MOTE_STEP_PX) + j.y * def.spread + def.driftY * ageMs;
        ctx.globalAlpha = moteAlpha(t);
        // Centred on (originX + bx, originY + by), not top-left anchored:
        // eoweb's TrailParticle sets `sprite.anchor.set(0.5)`
        // (src/render/trail-particle.ts), so the game centres every mote on
        // its point. drawImage has no anchor concept — it always paints from
        // the top-left corner — so the offset below is what makes this
        // preview land on the same pixel the game does instead of sitting
        // half a mote-width down-right of it.
        ctx.drawImage(
          mote,
          originX + bx - mote.width / 2,
          originY + by - mote.height / 2,
        );
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
