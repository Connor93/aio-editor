import { useEffect, useMemo, useRef, useState } from "react";

import { useRefs } from "../refs/RefsContext";
import { type JsonSchema, makeDefault, resolveRef } from "./schema";

/** Parse the leading numeric portion of a filename like "0042.json" → 42.
 *  Returns null for filenames that don't start with digits. */
function filenameId(filename: string): number | null {
  const m = /^(\d+)/.exec(filename);
  return m ? Number(m[1]) : null;
}

interface CommonProps {
  schema: JsonSchema;
  value: unknown;
  onChange: (next: unknown) => void;
  rootSchema: JsonSchema;
  path: string;
  label?: string;
  required?: boolean;
  /** Compact rendering hint used inside grouped sections — single-line label,
   *  smaller inputs, no path/description chrome. */
  compact?: boolean;
  /** The parent object's other field values, threaded down so a field can
   *  react to a sibling (e.g. worn-graphic picker resolving its gfx category
   *  from the item's `type`). Undefined at the root / for non-object fields. */
  siblings?: Record<string, unknown>;
}

export function SchemaField(props: CommonProps) {
  const resolved = resolveRef(props.schema, props.rootSchema);

  // x-aio-options takes precedence over the bare integer/string input.
  if (resolved["x-aio-options"]) {
    return <SelectField {...props} schema={resolved} />;
  }

  if (resolved["x-aio-ref"]) {
    if (resolved["x-aio-ref"].by === "filename-stem") {
      return <StringReferenceField {...props} schema={resolved} />;
    }
    return <ReferenceField {...props} schema={resolved} />;
  }

  if (resolved["x-aio-display"]?.kind === "percent") {
    return <PercentField {...props} schema={resolved} />;
  }

  if (resolved["x-aio-display"]?.kind === "gfx") {
    return <GfxField {...props} schema={resolved} />;
  }

  if (resolved["x-aio-display"]?.kind === "worn_gfx") {
    return <WornGfxField {...props} schema={resolved} />;
  }

  if (resolved.oneOf) {
    return <OneOfField {...props} schema={resolved} />;
  }

  if (resolved.type === "object") {
    if (resolved.properties) return <ObjectField {...props} schema={resolved} />;
    if (resolved.additionalProperties && resolved.additionalProperties !== true)
      return <DictField {...props} schema={resolved} />;
  }

  if (resolved.type === "array" && resolved.items) {
    return <ArrayField {...props} schema={resolved} />;
  }

  if (resolved.type === "integer" || resolved.type === "number") {
    return <NumberField {...props} schema={resolved} />;
  }

  if (resolved.type === "string") {
    return <StringField {...props} schema={resolved} />;
  }

  if (resolved.type === "boolean") {
    return <BooleanField {...props} schema={resolved} />;
  }

  return (
    <div className="text-xs text-amber-400">
      unsupported schema at {props.path}
    </div>
  );
}

function GfxField({ schema, value, onChange, path, label, required, compact }: CommonProps) {
  const display = schema["x-aio-display"]!;
  if (display.kind !== "gfx") {
    return <div className="text-xs text-amber-400">expected gfx display</div>;
  }
  return (
    <GfxFieldInner
      category={display.category}
      label={label}
      description={schema.description}
      value={value}
      onChange={onChange}
      path={path}
      required={required}
      compact={compact}
      min={schema.minimum ?? 0}
      max={schema.maximum}
    />
  );
}

function GfxFieldInner({
  category,
  label,
  description,
  value,
  onChange,
  path,
  required,
  compact,
  min,
  max,
}: {
  category: string;
  label?: string;
  description?: string;
  value: unknown;
  onChange: (next: unknown) => void;
  path: string;
  required?: boolean;
  compact?: boolean;
  min?: number;
  max?: number;
}) {
  const stored = typeof value === "number" ? value : 0;
  const [draftStr, setDraftStr] = useState<string>(String(stored));
  const lastEchoed = useRef<number>(stored);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if (stored !== lastEchoed.current) {
      setDraftStr(String(stored));
      lastEchoed.current = stored;
    }
  }, [stored]);

  const onInputChange = (raw: string) => {
    setDraftStr(raw);
    if (raw === "" || raw === "-") return;
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    const committed = Math.trunc(next);
    lastEchoed.current = committed;
    onChange(committed);
  };

  const handlePick = (graphicId: number) => {
    lastEchoed.current = graphicId;
    setDraftStr(String(graphicId));
    onChange(graphicId);
    setPickerOpen(false);
  };

  const previewSrc = stored > 0 ? `/api/gfx/${category}/${stored}` : null;

  return (
    <div className="group/field block">
      <FieldLabel label={label} required={required} description={description} path={path} compact={compact} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded border border-slate-700 p-0.5 hover:border-slate-500 hover:bg-slate-800/60"
          title={`Click to browse ${category} graphics`}
        >
          <GfxThumb src={previewSrc} category={category} graphicId={stored} />
        </button>
        <input
          type="number"
          value={draftStr}
          step={1}
          min={min ?? 0}
          max={max}
          onChange={(e) => onInputChange(e.target.value)}
          className={`${INPUT_BASE} ${INPUT_OK} w-24 tabular-nums`}
          title="Type a graphic id directly"
        />
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          browse…
        </button>
      </div>
      {pickerOpen && (
        <GraphicPicker
          category={category}
          currentId={stored}
          onPick={handlePick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/** eolib ItemType (equippable slots) → worn-graphic gfx category. Types not in
 *  this map (heal/teleport/etc.) don't have a worn graphic — `spec1` there is a
 *  plain type-dependent number. */
const WORN_CATEGORY: Record<number, string> = {
  10: "worn_weapon",
  11: "worn_shield",
  12: "worn_armor",
  13: "worn_hat",
  14: "worn_boots",
};

function WornGfxField(props: CommonProps) {
  const itemType =
    typeof props.siblings?.type === "number" ? (props.siblings.type as number) : undefined;
  const category = itemType !== undefined ? WORN_CATEGORY[itemType] : undefined;

  // Non-equippable (or type unset): spec1 is a type-dependent number
  // (ammo/heal/etc.), not a graphic — render the plain number field, keeping
  // the schema's "spec1" label + description.
  if (!category) {
    return <NumberField {...props} />;
  }

  return (
    <GfxFieldInner
      category={category}
      label="Worn graphic"
      description="On-character worn graphic (drawn on the map sprite)."
      value={props.value}
      onChange={props.onChange}
      path={props.path}
      required={props.required}
      compact={props.compact}
      min={0}
    />
  );
}

interface GraphicEntry {
  graphic_id: number;
  resource_id: number;
}

function GraphicPicker({
  category,
  currentId,
  onPick,
  onClose,
}: {
  category: string;
  currentId: number;
  onPick: (graphicId: number) => void;
  onClose: () => void;
}) {
  const [graphics, setGraphics] = useState<GraphicEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/gfx/${category}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { graphics: GraphicEntry[] };
      })
      .then((d) => {
        if (!cancelled) setGraphics(d.graphics);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  const filtered = useMemo(() => {
    if (!graphics) return [];
    const q = filter.trim();
    if (!q) return graphics;
    return graphics.filter((g) => String(g.graphic_id).includes(q));
  }, [graphics, filter]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-5xl flex-col rounded-lg border border-slate-800 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-2">
          <div className="flex items-baseline gap-3">
            <h3 className="text-sm font-semibold text-slate-200">
              Pick a {category.replace("_", " ")} graphic
            </h3>
            {graphics && (
              <span className="text-[11px] text-slate-500">
                {graphics.length} available
                {filter && ` · ${filtered.length} match`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="filter by id…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={`${INPUT_BASE} ${INPUT_OK} w-40 text-xs tabular-nums`}
              autoFocus
            />
            <button
              onClick={onClose}
              className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {error && (
            <div className="rounded border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {graphics === null && !error && (
            <p className="px-2 py-1 text-sm text-slate-500">loading…</p>
          )}
          {graphics !== null && filtered.length === 0 && (
            <p className="px-2 py-1 text-sm text-slate-500">no matches</p>
          )}
          {filtered.length > 0 && (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
              {filtered.map((g) => {
                const selected = g.graphic_id === currentId;
                return (
                  <li key={g.graphic_id}>
                    <button
                      type="button"
                      onClick={() => onPick(g.graphic_id)}
                      className={`flex w-full flex-col items-center gap-1 rounded border p-1 transition-colors ${
                        selected
                          ? "border-amber-500 bg-amber-500/10"
                          : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/60"
                      }`}
                      title={`graphic_id ${g.graphic_id} (resource ${g.resource_id})`}
                    >
                      <img
                        src={`/api/gfx/${category}/${g.graphic_id}`}
                        alt={`${category} ${g.graphic_id}`}
                        loading="lazy"
                        className="h-12 w-12 object-contain"
                      />
                      <span className="font-mono text-[10px] text-slate-400">
                        {g.graphic_id}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function GfxThumb(props: { src: string | null; category: string; graphicId: number }) {
  // Re-mount on src change so internal state resets cleanly and the previous
  // image doesn't flash through while the new one loads.
  return <GfxThumbInner key={props.src ?? "none"} {...props} />;
}

function GfxThumbInner({
  src,
  category,
  graphicId,
}: {
  src: string | null;
  category: string;
  graphicId: number;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "missing">(
    src ? "loading" : "missing"
  );

  if (!src) {
    return (
      <div
        className="flex h-12 w-12 items-center justify-center rounded border border-dashed border-slate-700 text-[10px] text-slate-600"
        title={`No ${category} graphic for id 0`}
      >
        —
      </div>
    );
  }

  return (
    <div className="relative h-12 w-12 shrink-0">
      <img
        src={src}
        alt={`${category} ${graphicId}`}
        title={`${category}/${graphicId}`}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("missing")}
        className={`h-12 w-12 rounded border border-slate-800 bg-slate-950 object-contain p-0.5 transition-opacity ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
      />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center rounded border border-slate-800 bg-slate-950 text-[10px] text-slate-600">
          …
        </div>
      )}
      {status === "missing" && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded border border-dashed border-slate-700 text-[10px] text-slate-600"
          title={`No ${category} graphic for id ${graphicId}`}
        >
          ?
        </div>
      )}
    </div>
  );
}

function PercentField({
  schema,
  value,
  onChange,
  path,
  label,
  required,
  compact,
}: CommonProps) {
  const display = schema["x-aio-display"]!;
  if (display.kind !== "percent") {
    return <div className="text-xs text-amber-400">expected percent display</div>;
  }
  const divisor = display.divisor;
  const stored = typeof value === "number" ? value : 0;
  const displayed = stored / divisor;

  // Local string state mirrors the NumberField pattern so the user can type
  // intermediate states like "0." or "1.0" without the input snapping back
  // to the integer-round-trip value on every keystroke.
  const [draftStr, setDraftStr] = useState<string>(formatPercent(displayed));
  const lastEchoed = useRef<number>(stored);
  useEffect(() => {
    if (stored !== lastEchoed.current) {
      setDraftStr(formatPercent(stored / divisor));
      lastEchoed.current = stored;
    }
  }, [stored, divisor]);

  const onInputChange = (raw: string) => {
    setDraftStr(raw);
    if (raw === "" || raw === "-") return;
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    const clampedPercent = Math.max(0, Math.min(100, next));
    const storedValue = Math.round(clampedPercent * divisor);
    lastEchoed.current = storedValue;
    onChange(storedValue);
  };

  const tooltip = `Stored as integer ${stored} (≈ ${displayed.toFixed(4)}%). Max precision ≈ ${(100 / (divisor * 100)).toFixed(4)}%.`;

  return (
    <label className={`group/field block ${compact ? "w-32" : ""}`} title={tooltip}>
      <FieldLabel
        label={label}
        required={required}
        description={schema.description}
        path={path}
        compact={compact}
      />
      <div className="relative">
        <input
          type="number"
          value={draftStr}
          step="any"
          min={0}
          max={100}
          onChange={(e) => onInputChange(e.target.value)}
          className={`${INPUT_BASE} ${INPUT_OK} ${compact ? "mt-0.5 w-full" : "w-full"} pr-7 tabular-nums`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-500">
          %
        </span>
      </div>
    </label>
  );
}

function formatPercent(p: number): string {
  // Show up to 4 decimals but strip trailing zeros so 100 renders as "100"
  // not "100.0000".
  return String(Number(p.toFixed(4)));
}

function ReferenceField({
  schema,
  value,
  onChange,
  path,
  label,
  required,
  compact,
}: CommonProps) {
  const ref = schema["x-aio-ref"]!;
  const refType = ref.type;
  const noneLabel = ref.noneLabel;
  const entry = useRefs(refType);

  const options = useMemo(() => {
    return entry.files
      .map((f) => {
        const id = filenameId(f.filename);
        if (id === null) return null;
        return {
          id,
          label: f.name ?? "(unnamed)",
          filename: f.filename,
        };
      })
      .filter((x): x is { id: number; label: string; filename: string } => x !== null)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [entry.files]);

  const currentId = typeof value === "number" ? value : null;
  const isNoneSentinel = currentId === 0 && noneLabel !== undefined;
  const matched =
    currentId !== null && !isNoneSentinel
      ? options.find((o) => o.id === currentId)
      : null;
  const unknown =
    currentId !== null &&
    !isNoneSentinel &&
    entry.status === "loaded" &&
    !matched;
  const loading = entry.status === "loading";

  const handleSelect = (raw: string) => {
    if (raw === "") return; // placeholder selection — keep current value
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(n);
  };

  return (
    <label className={`group/field block ${compact ? "w-32" : ""}`}>
      <FieldLabel
        label={label}
        required={required}
        description={schema.description}
        path={path}
        compact={compact}
      />
      <select
        value={
          isNoneSentinel
            ? "0"
            : matched
              ? String(matched.id)
              : ""
        }
        onChange={(e) => handleSelect(e.target.value)}
        disabled={loading || entry.status === "error"}
        className={`${INPUT_BASE} ${unknown ? INPUT_WARN : INPUT_OK} ${compact ? "mt-0.5 w-full" : "w-full"} tabular-nums`}
        title={
          unknown
            ? `Value ${currentId} not found in ${refType}/`
            : isNoneSentinel
              ? `${noneLabel} → ${refType}/`
              : `→ ${refType}/`
        }
      >
        {loading && (
          <option value="" disabled>
            loading {refType}…
          </option>
        )}
        {entry.status === "error" && (
          <option value="" disabled>
            error loading {refType}
          </option>
        )}
        {!matched && !isNoneSentinel && !loading && entry.status !== "error" && (
          <option value="" disabled>
            {unknown
              ? `(unknown: ${currentId}) — pick a ${refType}`
              : `(pick a ${refType})`}
          </option>
        )}
        {noneLabel !== undefined && (
          <option value="0">{noneLabel}</option>
        )}
        {options
          .filter((o) => !(noneLabel !== undefined && o.id === 0))
          .map((o) => (
            <option key={o.id} value={String(o.id)}>
              {o.label} ({o.filename.replace(/\.json$/, "")})
            </option>
          ))}
      </select>
    </label>
  );
}

/** Cross-pub reference for STRING-keyed pubs (`x-aio-ref` with
 *  `by: "filename-stem"`). Options come from the referenced pub's file list;
 *  each option is labelled by the file's `name` field and stores the filename
 *  stem (e.g. a modifier's `mod_id` like "fire_dmg"). Mirrors ReferenceField
 *  but for strings — no numeric id, no `noneLabel`/0 sentinel. */
function StringReferenceField({
  schema,
  value,
  onChange,
  path,
  label,
  required,
  compact,
}: CommonProps) {
  const ref = schema["x-aio-ref"]!;
  const refType = ref.type;
  const entry = useRefs(refType);

  const options = useMemo(() => {
    return entry.files
      .map((f) => {
        const stem = f.filename.replace(/\.json$/, "");
        // Show "Burning (fire_dmg)" — the flavor name leads, the mod_id follows
        // in parens so it's identifiable at a glance (the names are non-obvious,
        // e.g. Sharpened = crit_chance). Stored value stays the stem (mod_id).
        return { stem, label: f.name ? `${f.name} (${stem})` : stem };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [entry.files]);

  const current = typeof value === "string" ? value : null;
  const matched = current !== null && current !== "" ? options.find((o) => o.stem === current) : null;
  const unknown =
    current !== null && current !== "" && entry.status === "loaded" && !matched;
  const loading = entry.status === "loading";

  const handleSelect = (raw: string) => {
    if (raw === "") return; // placeholder selection — keep current value
    onChange(raw);
  };

  return (
    <label className={`group/field block ${compact ? "w-32" : ""}`}>
      <FieldLabel
        label={label}
        required={required}
        description={schema.description}
        path={path}
        compact={compact}
      />
      <select
        value={matched ? matched.stem : ""}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={loading || entry.status === "error"}
        className={`${INPUT_BASE} ${unknown ? INPUT_WARN : INPUT_OK} ${compact ? "mt-0.5 w-full" : "w-full"}`}
        title={
          unknown ? `Value ${current} not found in ${refType}/` : `→ ${refType}/`
        }
      >
        {loading && (
          <option value="" disabled>
            loading {refType}…
          </option>
        )}
        {entry.status === "error" && (
          <option value="" disabled>
            error loading {refType}
          </option>
        )}
        {!matched && !loading && entry.status !== "error" && (
          <option value="" disabled>
            {unknown
              ? `(unknown: ${current}) — pick a ${refType}`
              : `(pick a ${refType})`}
          </option>
        )}
        {options.map((o) => (
          <option key={o.stem} value={o.stem}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SelectField({
  schema,
  value,
  onChange,
  path,
  label,
  required,
  compact,
}: CommonProps) {
  const options = schema["x-aio-options"] ?? [];
  // Find the option whose value matches; null when the file has a value not
  // in our list (e.g. an Unrecognized variant from a newer REOSERV).
  const matchedIndex = options.findIndex((o) => o.value === value);
  const unrecognized = matchedIndex === -1 && value !== undefined && value !== null;

  const handleChange = (rawIndex: string) => {
    const idx = Number(rawIndex);
    const picked = options[idx];
    if (!picked) return;
    onChange(picked.value);
  };

  const selectedDescription = matchedIndex >= 0 ? options[matchedIndex]?.description : undefined;

  return (
    <label className={`group/field block ${compact ? "w-32" : ""}`}>
      <FieldLabel label={label} required={required} description={schema.description} path={path} compact={compact} />
      <select
        value={matchedIndex >= 0 ? String(matchedIndex) : ""}
        onChange={(e) => handleChange(e.target.value)}
        className={`${INPUT_BASE} ${unrecognized ? INPUT_WARN : INPUT_OK} ${compact ? "mt-0.5 w-full" : "w-full"}`}
      >
        {matchedIndex === -1 && (
          <option value="" disabled>
            {unrecognized
              ? `(unrecognized: ${JSON.stringify(value)})`
              : "(pick a value)"}
          </option>
        )}
        {options.map((opt, i) => (
          <option key={i} value={String(i)}>
            {opt.label} {typeof opt.value === "number" ? `(${opt.value})` : ""}
          </option>
        ))}
      </select>
      {selectedDescription && !compact && (
        <p className="mt-1 text-xs text-slate-400">{selectedDescription}</p>
      )}
    </label>
  );
}

const INPUT_BASE =
  "rounded-md border bg-slate-950 px-2 py-1 text-sm text-slate-100 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500/40 disabled:opacity-50";
const INPUT_OK = "border-slate-700";
const INPUT_WARN = "border-amber-600/70";
/** Same look as the other bare `<select>` fields (e.g. SelectField's
 *  className) — OneOfField's variant picker never has a "compact" or
 *  "unrecognized value" state, so it doesn't need those ternaries. */
const SELECT_CLS = `${INPUT_BASE} ${INPUT_OK} w-full`;

/** Strip common suffixes for the very tight inline stat-block layout. Keeps
 *  the label informative ("LIGHT" / "STR REQ" / "MIN DMG") without overflowing
 *  a w-24 column. Full name is still available via the title tooltip. */
function shortenForCompact(label: string): string {
  return label
    .replace(/_resistance$/i, "")
    .replace(/_requirement$/i, "_req")
    .replace(/_damage$/i, "_dmg")
    .replace(/_heal$/i, "_heal")
    .replace(/_grant$/i, "");
}

function FieldLabel({
  label,
  required,
  description,
  path,
  compact,
}: {
  label?: string;
  required?: boolean;
  description?: string;
  path: string;
  compact?: boolean;
}) {
  if (!label) return null;
  const tooltip = description
    ? `${label}${description ? ` — ${description}` : ""}${path ? `\n${path}` : ""}`
    : `${label}${path ? `\n${path}` : ""}`;
  if (compact) {
    return (
      <div
        className="flex items-baseline gap-1 overflow-hidden"
        title={tooltip}
      >
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium uppercase tracking-wide text-slate-400">
          {shortenForCompact(label)}
        </span>
        {required && <span className="shrink-0 text-red-400">*</span>}
      </div>
    );
  }
  return (
    <div className="mb-1 flex items-baseline gap-2">
      <span
        className="text-sm font-medium text-slate-200"
        title={description ? `${label} — ${description}` : undefined}
      >
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </span>
      <span className="hidden font-mono text-[10px] text-slate-600 group-hover/field:inline">
        {path}
      </span>
    </div>
  );
}

function branchTitle(b: JsonSchema, i: number): string {
  return b.title ?? `Option ${i + 1}`;
}

// Which oneOf branch does the current value match?
function activeBranchIndex(
  branches: JsonSchema[],
  discrim: string | undefined,
  value: unknown,
): number {
  if (discrim && value && typeof value === "object") {
    const tag = (value as Record<string, unknown>)[discrim];
    const i = branches.findIndex(
      (b) => b.properties?.[discrim]?.const === tag,
    );
    if (i >= 0) return i;
  }
  if (!discrim) {
    // Untagged: match by JSON type (object vs scalar).
    const isObj = value !== null && typeof value === "object" && !Array.isArray(value);
    const i = branches.findIndex((b) => (b.type === "object") === isObj);
    if (i >= 0) return i;
  }
  return 0;
}

function OneOfField({ schema, value, onChange, rootSchema, path, label, required }: CommonProps) {
  const branches = schema.oneOf ?? [];
  const discrim = schema.discriminator?.propertyName;
  const active = activeBranchIndex(branches, discrim, value);
  const branch = branches[active] ?? branches[0];

  const onPick = (nextIdx: number) => {
    if (nextIdx === active) return;
    const nextBranch = branches[nextIdx];
    if (!nextBranch) return;
    onChange(makeDefault(nextBranch, rootSchema));
  };

  if (!branch) {
    return (
      <div className="text-xs text-amber-400">oneOf with no branches at {path}</div>
    );
  }

  // For an object branch, render its fields but hide the discriminator prop
  // (the <select> owns it). Build a copy of the branch minus that property.
  const childSchema: JsonSchema =
    branch.type === "object" && discrim && branch.properties
      ? { ...branch, properties: Object.fromEntries(
            Object.entries(branch.properties).filter(([k]) => k !== discrim)) }
      : branch;

  return (
    <div className="space-y-1">
      <FieldLabel label={label} required={required} path={path} />
      <select
        className={SELECT_CLS}
        value={String(active)}
        onChange={(e) => onPick(Number((e.target as HTMLSelectElement).value))}
      >
        {branches.map((b, i) => (
          <option key={i} value={String(i)}>{branchTitle(b, i)}</option>
        ))}
      </select>
      <SchemaField
        schema={childSchema}
        value={value}
        onChange={onChange}
        rootSchema={rootSchema}
        path={path}
      />
    </div>
  );
}

function ObjectField({ schema, value, onChange, rootSchema, path, label, required, compact }: CommonProps) {
  const obj = (value && typeof value === "object" && !Array.isArray(value))
    ? (value as Record<string, unknown>)
    : {};
  const groups = schema["x-aio-groups"];

  // Grouped layout fires at the form root (top-level object with declared
  // groups). Nested objects keep the flat layout — keeps complexity bounded
  // and matches how groups are authored today.
  if (groups && path === "/") {
    return (
      <GroupedObject
        schema={schema}
        groups={groups}
        obj={obj}
        onChange={onChange}
        rootSchema={rootSchema}
      />
    );
  }

  const properties = schema.properties ?? {};
  const requiredKeys = new Set(schema.required ?? []);

  // Split properties into "render now" (required or already present) and
  // "offer to add" (optional and absent). Forcing optional sub-objects to
  // render with seeded defaults would let users save half-populated
  // structures that the schema considers missing-from-the-start.
  const presentKeys = new Set(Object.keys(obj));
  const renderedKeys: string[] = [];
  const addableKeys: string[] = [];
  for (const key of Object.keys(properties)) {
    if (requiredKeys.has(key) || presentKeys.has(key)) {
      renderedKeys.push(key);
    } else {
      addableKeys.push(key);
    }
  }

  return (
    <fieldset className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <FieldLabel label={label} required={required} description={schema.description} path={path} />
      <div className="space-y-3">
        {renderedKeys.map((key) => {
          const childSchema = properties[key]!;
          const childPath = `${path === "/" ? "" : path}/${key}`;
          const isOptional = !requiredKeys.has(key);
          return (
            <div key={key} className="group/row relative">
              <SchemaField
                schema={childSchema}
                value={obj[key]}
                rootSchema={rootSchema}
                path={childPath}
                label={key}
                required={requiredKeys.has(key)}
                onChange={(next) => onChange({ ...obj, [key]: next })}
                compact={compact}
                siblings={obj}
              />
              {isOptional && (
                <button
                  type="button"
                  onClick={() => {
                    const rest = { ...obj };
                    delete rest[key];
                    onChange(rest);
                  }}
                  className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-800 hover:text-slate-200 group-hover/row:flex"
                  title={`remove optional ${key}`}
                  aria-label={`remove ${key}`}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        {addableKeys.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[10px] uppercase text-slate-500">optional</span>
            {addableKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  onChange({
                    ...obj,
                    [key]: makeDefault(properties[key]!, rootSchema),
                  })
                }
                className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                + {key}
              </button>
            ))}
          </div>
        )}
      </div>
    </fieldset>
  );
}

interface GroupedObjectProps {
  schema: JsonSchema;
  groups: NonNullable<JsonSchema["x-aio-groups"]>;
  obj: Record<string, unknown>;
  onChange: (next: unknown) => void;
  rootSchema: JsonSchema;
}

function GroupedObject({ schema, groups, obj, onChange, rootSchema }: GroupedObjectProps) {
  const properties = schema.properties ?? {};
  const requiredKeys = new Set(schema.required ?? []);

  // Any properties not claimed by an authored group land in a trailing "Other"
  // section so nothing silently disappears when a schema is mid-rollout.
  const groupedKeys = new Set(groups.flatMap((g) => g.fields));
  const otherKeys = Object.keys(properties).filter((k) => !groupedKeys.has(k));
  const sections = otherKeys.length > 0
    ? [...groups, { label: "Other", fields: otherKeys }]
    : groups;

  return (
    <div className="space-y-6">
      {sections.map((group) => (
        <GroupedSection
          key={group.label}
          group={group}
          properties={properties}
          requiredKeys={requiredKeys}
          obj={obj}
          onChange={onChange}
          rootSchema={rootSchema}
        />
      ))}
    </div>
  );
}

interface GroupedSectionProps {
  group: NonNullable<JsonSchema["x-aio-groups"]>[number];
  properties: Record<string, JsonSchema>;
  requiredKeys: Set<string>;
  obj: Record<string, unknown>;
  onChange: (next: unknown) => void;
  rootSchema: JsonSchema;
}

function GroupedSection({
  group,
  properties,
  requiredKeys,
  obj,
  onChange,
  rootSchema,
}: GroupedSectionProps) {
  const renderedKeys: string[] = [];
  const addableKeys: string[] = [];
  const presentKeys = new Set(Object.keys(obj));

  for (const key of group.fields) {
    if (!properties[key]) continue;
    if (requiredKeys.has(key) || presentKeys.has(key)) {
      renderedKeys.push(key);
    } else {
      addableKeys.push(key);
    }
  }

  if (renderedKeys.length === 0 && addableKeys.length === 0) {
    // No rendered fields and no addable fields — section has nothing to offer.
    // (As soon as a group has any optional field the user could add, we keep
    //  the header visible so the section is discoverable.)
    return null;
  }

  const layout = group.layout ?? "grid";
  const containerClass =
    layout === "inline"
      ? "flex flex-wrap gap-3"
      : "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3";
  const compactChildren = layout === "inline";

  return (
    <section>
      <div className="sticky top-0 z-10 -mx-4 mb-3 border-b border-slate-800 bg-slate-950/95 px-4 py-2 backdrop-blur">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          {group.label}
        </h3>
        {group.description && (
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
            {group.description}
          </p>
        )}
      </div>
      <div className={containerClass}>
        {renderedKeys.map((key) => {
          const childSchema = properties[key]!;
          const isOptional = !requiredKeys.has(key);
          const showRemove = isOptional && !compactChildren;
          return (
            <div key={key} className="group/row relative">
              <SchemaField
                schema={childSchema}
                value={obj[key]}
                rootSchema={rootSchema}
                path={`/${key}`}
                label={key}
                required={requiredKeys.has(key)}
                onChange={(next) => onChange({ ...obj, [key]: next })}
                compact={compactChildren}
                siblings={obj}
              />
              {showRemove && (
                <button
                  type="button"
                  onClick={() => {
                    const rest = { ...obj };
                    delete rest[key];
                    onChange(rest);
                  }}
                  className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-800 hover:text-slate-200 group-hover/row:flex"
                  title={`remove optional ${key}`}
                  aria-label={`remove ${key}`}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      {addableKeys.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase text-slate-500">optional</span>
          {addableKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                onChange({
                  ...obj,
                  [key]: makeDefault(properties[key]!, rootSchema),
                })
              }
              className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              + {key}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ArrayField({ schema, value, onChange, rootSchema, path, label, required }: CommonProps) {
  const arr = Array.isArray(value) ? value : [];
  const itemSchema = schema.items as JsonSchema;

  return (
    <fieldset className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <FieldLabel label={label} required={required} description={schema.description} path={path} />
      <div className="space-y-2">
        {arr.length === 0 && (
          <p className="text-xs italic text-slate-500">(empty)</p>
        )}
        {arr.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1">
              <SchemaField
                schema={itemSchema}
                value={item}
                rootSchema={rootSchema}
                path={`${path === "/" ? "" : path}/${i}`}
                onChange={(next) => onChange(arr.map((v, idx) => (idx === i ? next : v)))}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(arr.filter((_, idx) => idx !== i))}
              className="mt-1 rounded border border-red-900/60 px-2 py-1 text-xs text-red-400 hover:bg-red-950/40"
              title={`remove index ${i}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...arr, makeDefault(itemSchema, rootSchema)])}
          className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          + add item
        </button>
      </div>
    </fieldset>
  );
}

function DictField({ schema, value, onChange, rootSchema, path, label, required }: CommonProps) {
  const dict = (value && typeof value === "object" && !Array.isArray(value))
    ? (value as Record<string, unknown>)
    : {};
  const valueSchema = schema.additionalProperties as JsonSchema;
  const patternStr = schema.propertyNames?.pattern;
  const keyPattern = useMemo(() => {
    if (!patternStr) return null;
    try {
      return new RegExp(patternStr);
    } catch {
      return null;
    }
  }, [patternStr]);

  const [newKey, setNewKey] = useState("");
  const newKeyValid =
    newKey.length > 0 &&
    (!keyPattern || keyPattern.test(newKey)) &&
    !Object.prototype.hasOwnProperty.call(dict, newKey);

  return (
    <fieldset className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <FieldLabel label={label} required={required} description={schema.description} path={path} />
      <div className="space-y-2">
        {Object.keys(dict).length === 0 && (
          <p className="text-xs italic text-slate-500">(empty)</p>
        )}
        {Object.entries(dict).map(([key, v]) => (
          <div key={key} className="flex items-start gap-2">
            <div className="w-32 pt-2 font-mono text-xs text-slate-400">{key}</div>
            <div className="flex-1">
              <SchemaField
                schema={valueSchema}
                value={v}
                rootSchema={rootSchema}
                path={`${path === "/" ? "" : path}/${key}`}
                onChange={(next) => onChange({ ...dict, [key]: next })}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const rest = { ...dict };
                delete rest[key];
                onChange(rest);
              }}
              className="mt-1 rounded border border-red-900/60 px-2 py-1 text-xs text-red-400 hover:bg-red-950/40"
              title={`remove key ${key}`}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            placeholder={keyPattern ? `new key (${schema.propertyNames?.pattern})` : "new key"}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="w-48 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
          />
          <button
            type="button"
            disabled={!newKeyValid}
            onClick={() => {
              onChange({ ...dict, [newKey]: makeDefault(valueSchema, rootSchema) });
              setNewKey("");
            }}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            + add entry
          </button>
        </div>
      </div>
    </fieldset>
  );
}

function StringField({ schema, value, onChange, path, label, required, compact }: CommonProps) {
  const s = typeof value === "string" ? value : "";
  const tooShort = typeof schema.minLength === "number" && s.length < schema.minLength;

  return (
    <label className="group/field block">
      <FieldLabel label={label} required={required} description={schema.description} path={path} compact={compact} />
      <input
        type="text"
        value={s}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_BASE} ${tooShort ? INPUT_WARN : INPUT_OK} ${compact ? "mt-0.5 w-full" : "w-full"}`}
      />
    </label>
  );
}

function NumberField({ schema, value, onChange, path, label, required, compact }: CommonProps) {
  const n = typeof value === "number" ? value : 0;
  const tooLow = typeof schema.minimum === "number" && n < schema.minimum;
  const tooHigh = typeof schema.maximum === "number" && n > schema.maximum;
  const out = tooLow || tooHigh;
  const isInteger = schema.type === "integer";

  // Hold a local string so the user can type intermediate states like
  // "0.", "1e", or "-" without each keystroke re-rendering to the
  // truncated/parsed value (the old "locked to 0" bug). External value
  // changes (e.g. from the JSON view) re-seed the local string.
  const [draftStr, setDraftStr] = useState<string>(String(n));
  const lastEchoed = useRef<number>(n);
  useEffect(() => {
    if (n !== lastEchoed.current) {
      setDraftStr(String(n));
      lastEchoed.current = n;
    }
  }, [n]);

  const onInputChange = (raw: string) => {
    setDraftStr(raw);
    if (raw === "" || raw === "-") return; // mid-typing — don't write yet
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    const committed = isInteger ? Math.trunc(next) : next;
    lastEchoed.current = committed;
    onChange(committed);
  };

  const sharedInputProps = {
    type: "number" as const,
    value: draftStr,
    step: isInteger ? 1 : "any",
    min: schema.minimum,
    max: schema.maximum,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onInputChange(e.target.value),
  };

  if (compact) {
    return (
      <label className="block w-24">
        <FieldLabel label={label} required={required} description={schema.description} path={path} compact />
        <input
          {...sharedInputProps}
          className={`${INPUT_BASE} ${out ? INPUT_WARN : INPUT_OK} mt-0.5 w-full tabular-nums`}
        />
      </label>
    );
  }

  return (
    <label className="group/field block">
      <FieldLabel label={label} required={required} description={schema.description} path={path} />
      <input
        {...sharedInputProps}
        className={`${INPUT_BASE} ${out ? INPUT_WARN : INPUT_OK} w-full tabular-nums`}
      />
    </label>
  );
}

function BooleanField({ schema, value, onChange, path, label, required, compact }: CommonProps) {
  const checked = value === true;
  return (
    <label className={`flex items-center gap-2 ${compact ? "text-sm" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-slate-200"
      />
      <span className={compact ? "text-xs text-slate-200" : "text-sm text-slate-200"}>
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </span>
      {!compact && (
        <span className="font-mono text-[10px] text-slate-500">{path}</span>
      )}
      {schema.description && !compact && (
        <span className="ml-2 text-xs text-slate-500">{schema.description}</span>
      )}
    </label>
  );
}
