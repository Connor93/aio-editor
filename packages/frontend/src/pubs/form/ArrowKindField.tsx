import { useEffect, useRef } from "react";

import {
  ARROW_CANVAS_SIZE,
  ARROW_SHAPES,
  arrowFacings,
  DEFAULT_ARROW_SHAPE,
  drawArrowCanvas,
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

function ShapePreview({ shapeId }: { shapeId: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
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
    ctx.drawImage(art, 0, 0, host.width, host.height);
  }, [shapeId]);
  return (
    <canvas
      ref={ref}
      width={ARROW_CANVAS_SIZE * PREVIEW_SCALE}
      height={ARROW_CANVAS_SIZE * PREVIEW_SCALE}
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
