import { useRef, useState } from "react";

import {
  buildIndex,
  buildShapes,
  composeVfxName,
  type CycleKey,
  ELEMENTS,
  type ElementKey,
  RAMP_BASE,
  type SizeKey,
  type VfxAxes,
  type VfxShape,
} from "../../vfx-engine";
import { SHEET_NAMES, VFX_SUGGESTIONS } from "./suggest-values";
import { VfxPreview } from "./VfxPreview";

/** Both allocate their whole structure per call — build once at module scope,
 *  same as VfxPreview does with buildRegistry(). */
const VFX_INDEX: Record<string, VfxAxes> = buildIndex();
const VFX_SHAPES: VfxShape[] = buildShapes();
const SHAPE_BY_ID = new Map(VFX_SHAPES.map((s) => [s.id, s]));

const SHEET_PREFIX = "sheet:";

const NONE_ID = "none";
const CUSTOM_ID = "custom";

const ELEMENT_ORDER: ElementKey[] = [
  "neutral", "fire", "water", "earth", "wind", "light", "dark",
];
const SIZE_ORDER: ReadonlyArray<readonly [SizeKey, string]> = [
  ["sm", "S"], ["base", "M"], ["lg", "L"],
];
const CYCLE_ORDER: ReadonlyArray<readonly [CycleKey, string]> = [
  [1, "1×"], [2, "2×"], [3, "3×"],
];

function hex(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, "0")}`;
}

interface Selection {
  shapeId: string;
  element?: ElementKey;
  size?: SizeKey;
  cycles?: CycleKey;
}

/** stored string -> control state. Never parses: it's an index lookup, so a
 *  dashed kind (`spark-burst-fire-lg`) and a combo (`disc-spark-burst-fire`)
 *  resolve correctly without disambiguation. */
function decompose(value: string): Selection {
  if (!value) return { shapeId: NONE_ID };
  if (SHEET_NAMES.includes(value)) return { shapeId: `${SHEET_PREFIX}${value}` };
  const axes = VFX_INDEX[value];
  if (axes) {
    return { shapeId: axes.shapeId, element: axes.element, size: axes.size, cycles: axes.cycles };
  }
  return { shapeId: CUSTOM_ID };
}

export function VfxField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [raw, setRaw] = useState(false);
  /** Last element/size the author picked, so Nova -> Heal Glow -> Nova restores
   *  the tint and size instead of snapping back to neutral/base. Refs, not
   *  state: they're only read when composing the NEXT value and must never
   *  trigger a render. Written in `emit` (a handler), never during render. */
  const lastElement = useRef<ElementKey>("neutral");
  const lastSize = useRef<SizeKey>("base");
  const lastCycles = useRef<CycleKey>(1);

  const sel = decompose(value);
  const shape = SHAPE_BY_ID.get(sel.shapeId);
  const isCustom = sel.shapeId === CUSTOM_ID;
  const isSheet = sel.shapeId.startsWith(SHEET_PREFIX);
  const hasElement = shape?.hasElement ?? false;
  const hasSize = shape?.hasSize ?? false;
  const hasCycles = shape?.hasCycles ?? false;

  const emit = (
    shapeId: string,
    element: ElementKey,
    size: SizeKey,
    cycles: CycleKey,
  ) => {
    lastElement.current = element;
    lastSize.current = size;
    lastCycles.current = cycles;
    if (shapeId === NONE_ID) return onChange("");
    if (shapeId.startsWith(SHEET_PREFIX)) {
      return onChange(shapeId.slice(SHEET_PREFIX.length));
    }
    const next = composeVfxName(shapeId, element, size, cycles);
    if (next) onChange(next);
  };

  const pickShape = (id: string) => {
    if (id === CUSTOM_ID) return; // display-only pinned entry
    emit(
      id,
      sel.element ?? lastElement.current,
      sel.size ?? lastSize.current,
      sel.cycles ?? lastCycles.current,
    );
  };
  const pickElement = (el: ElementKey) =>
    emit(sel.shapeId, el, sel.size ?? lastSize.current, sel.cycles ?? lastCycles.current);
  const pickSize = (sz: SizeKey) =>
    emit(sel.shapeId, sel.element ?? lastElement.current, sz, sel.cycles ?? lastCycles.current);
  const pickCycles = (cy: CycleKey) =>
    emit(sel.shapeId, sel.element ?? lastElement.current, sel.size ?? lastSize.current, cy);

  if (raw) {
    return (
      <div className="mt-0.5">
        <div className="flex items-center gap-2">
          <input
            type="text"
            list="vfx-raw-suggestions"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/40"
          />
          <button
            type="button"
            onClick={() => setRaw(false)}
            className="shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500 hover:bg-slate-800/60"
            title="Back to pickers"
          >
            ‹
          </button>
        </div>
        <datalist id="vfx-raw-suggestions">
          {VFX_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <VfxPreview value={value} />
      </div>
    );
  }

  return (
    <div className="mt-0.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <select
          value={sel.shapeId}
          onChange={(e) => pickShape(e.target.value)}
          className={`w-full rounded-md border bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/40 ${
            isCustom ? "border-amber-600/70" : "border-slate-700"
          }`}
        >
          {isCustom && <option value={CUSTOM_ID}>⚠ Custom: {value}</option>}
          <option value={NONE_ID}>None</option>
          {VFX_SHAPES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
          {SHEET_NAMES.map((n) => (
            <option key={n} value={`${SHEET_PREFIX}${n}`}>
              {n} (sheet)
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setRaw(true)}
          className="shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500 hover:bg-slate-800/60"
          title="Edit the raw effect name"
        >
          ›
        </button>
      </div>

      {isCustom && (
        <p className="text-xs text-amber-500/90">not a known effect — kept as-is</p>
      )}

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          {ELEMENT_ORDER.map((el) => (
            <button
              key={el}
              type="button"
              disabled={!hasElement}
              onClick={() => pickElement(el)}
              title={el}
              style={{ backgroundColor: hex(ELEMENTS[el][RAMP_BASE]) }}
              className={`h-5 w-5 rounded-full border transition disabled:opacity-25 ${
                sel.element === el
                  ? "border-slate-100 ring-2 ring-slate-400/70"
                  : "border-slate-600 hover:border-slate-400"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-0.5">
          {/* No shape has both Size and Cycles: render whichever axis this
           *  shape actually has, and fall back to the greyed Size control
           *  (today's "no such axis" affordance) when it has neither. */}
          {hasCycles
            ? CYCLE_ORDER.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  disabled={!hasCycles}
                  onClick={() => pickCycles(key)}
                  className={`w-7 rounded border px-1 py-0.5 text-xs transition disabled:opacity-25 ${
                    sel.cycles === key
                      ? "border-slate-400 bg-slate-700 text-slate-100"
                      : "border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {label}
                </button>
              ))
            : SIZE_ORDER.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  disabled={!hasSize}
                  onClick={() => pickSize(key)}
                  className={`w-7 rounded border px-1 py-0.5 text-xs transition disabled:opacity-25 ${
                    sel.size === key
                      ? "border-slate-400 bg-slate-700 text-slate-100"
                      : "border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {label}
                </button>
              ))}
        </div>
      </div>

      {!isSheet && !isCustom && sel.shapeId !== NONE_ID && (
        <p className="font-mono text-[10px] text-slate-500">→ {value}</p>
      )}

      <VfxPreview value={value} />
    </div>
  );
}
