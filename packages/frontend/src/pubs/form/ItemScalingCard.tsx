import { useState } from "react";

import { suggestedFor, suggestedStatsForType } from "./suggestedItemStats";
import {
  CORE_STATS,
  MAX_LEVEL,
  PREVIEW_LEVELS,
  SCALED_STATS,
  baseForLevel,
  scaledAt,
} from "./statScaling";

interface ItemScalingCardProps {
  /** Parsed item draft. */
  item: Record<string, unknown>;
  /** Merge a stat patch into the draft. */
  onPatch: (patch: Record<string, number>) => void;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clampLevel(n: number): number {
  return Math.min(MAX_LEVEL, Math.max(1, Math.round(n)));
}

export function ItemScalingCard({ item, onPatch }: ItemScalingCardProps) {
  // Only equipment scales (author-at-max); potions/keys/etc. don't.
  const slot = suggestedStatsForType(item.type);
  // Default to max level: at L50 what you type IS what gets stored (no surprise).
  // Lower levels are an optional "what would this feel like at level N" lens.
  const [level, setLevel] = useState(MAX_LEVEL);
  const [vals, setVals] = useState<Record<string, string>>({});

  if (!slot) return null;

  const atMax = level === MAX_LEVEL;
  const active = SCALED_STATS.filter((s) => num(item[s.key], 0) !== 0);

  // Preview columns: the fixed snapshots plus the chosen level, so the preview
  // and the converter always agree on "what a level-N drop shows".
  const previewLevels = PREVIEW_LEVELS.includes(level)
    ? PREVIEW_LEVELS
    : [...PREVIEW_LEVELS, level].sort((a, b) => a - b);

  // Converter rows: always the combat stats; core stats only when the item
  // already has one OR this slot budgets it, so the list stays relevant.
  const rows = SCALED_STATS.filter(
    (s) =>
      !CORE_STATS.has(s.key) ||
      num(item[s.key], 0) !== 0 ||
      suggestedFor(slot, s.key) != null,
  );

  const loadFromItem = () => {
    const next: Record<string, string> = {};
    for (const s of SCALED_STATS) {
      const base = num(item[s.key], 0);
      next[s.key] = base ? String(Math.round(scaledAt(s.key, base, level))) : "";
    }
    setVals(next);
  };

  const apply = () => {
    const patch: Record<string, number> = {};
    for (const s of SCALED_STATS) {
      const raw = vals[s.key];
      if (raw == null || raw.trim() === "") continue;
      const v = Number(raw);
      if (Number.isFinite(v)) patch[s.key] = Math.round(baseForLevel(s.key, v, level));
    }
    if (Object.keys(patch).length > 0) onPatch(patch);
  };

  return (
    <div className="mb-4 rounded-md border border-sky-900/60 bg-slate-900 p-3 shadow-md shadow-slate-950/60">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-300">
          Stat scaling — {slot.slot}
        </h3>
        <span className="text-[10px] text-slate-500">stored = level {MAX_LEVEL}</span>
      </div>

      <p className="mb-2 text-[10px] leading-snug text-slate-500">
        This item’s stats are stored as their <strong>level-{MAX_LEVEL}</strong>{" "}
        values; the world scales them <em>down</em> for lower-level drops. The
        table shows what a drop at each level actually gives.
      </p>

      {active.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          Set some combat stats to preview how they scale across drop levels.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="pb-1 text-left font-medium">Stat</th>
                {previewLevels.map((lv) => (
                  <th
                    key={lv}
                    className={`pb-1 text-right font-medium tabular-nums ${
                      lv === level ? "text-sky-300" : ""
                    }`}
                  >
                    L{lv}
                    {lv === MAX_LEVEL ? " · stored" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map((s) => {
                const base = num(item[s.key], 0);
                return (
                  <tr key={s.key} className="text-slate-300">
                    <td className="py-0.5 text-slate-400">{s.label}</td>
                    {previewLevels.map((lv) => (
                      <td
                        key={lv}
                        className={`py-0.5 text-right font-mono tabular-nums ${
                          lv === level ? "text-sky-200" : ""
                        }`}
                      >
                        {Math.round(scaledAt(s.key, base, lv))}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="my-2 border-t border-slate-800" />

      {/* Author converter — writes level-50 values into the item. */}
      <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-400">
        <span>Author for a level:</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_LEVEL}
          className="w-16 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-right font-mono text-slate-200 tabular-nums"
          value={level}
          onInput={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            if (Number.isFinite(v)) setLevel(clampLevel(v));
          }}
        />
        <span className="text-slate-600">/ {MAX_LEVEL}</span>
        <button
          type="button"
          className="ml-auto rounded border border-slate-700 px-1.5 py-0.5 text-slate-300 hover:text-slate-100"
          onClick={loadFromItem}
        >
          Load from item
        </button>
      </div>

      {atMax ? (
        <p className="mb-2 text-[10px] leading-snug text-slate-500">
          You’re authoring at level {MAX_LEVEL} — what you type is written to the
          item <em>exactly</em>. The grey <span className="text-slate-400">~value</span>{" "}
          is the slot’s suggested budget.
        </p>
      ) : (
        <div className="mb-2 rounded border border-amber-900/60 bg-amber-950/30 px-2 py-1.5 text-[10px] leading-snug text-amber-200/90">
          Previewing level {level}. Clicking writes the{" "}
          <strong>level-{MAX_LEVEL}</strong> equivalent (larger — see{" "}
          <span className="font-mono">→ stores</span>), because a level-{level} drop
          only shows a fraction of the stored value.
          {level < 10 && (
            <>
              {" "}
              Below level 10 the numbers round heavily — author near level{" "}
              {MAX_LEVEL} for precision.
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {rows.map((s) => {
          const sugBase = suggestedFor(slot, s.key);
          const sugAtLevel = sugBase != null ? Math.round(scaledAt(s.key, sugBase, level)) : null;
          const raw = vals[s.key];
          const typed = raw != null && raw.trim() !== "" ? Number(raw) : null;
          const hasTyped = typed != null && Number.isFinite(typed);
          const stores = hasTyped ? Math.round(baseForLevel(s.key, typed, level)) : null;
          let flag: { sym: string; cls: string } | null = null;
          if (sugAtLevel != null && hasTyped) {
            const ratio = sugAtLevel === 0 ? (typed === 0 ? 1 : 2) : typed / sugAtLevel;
            if (ratio >= 0.9 && ratio <= 1.1) flag = { sym: "✓", cls: "text-emerald-400" };
            else if (ratio < 0.9) flag = { sym: "↓", cls: "text-amber-400" };
            else flag = { sym: "↑", cls: "text-amber-400" };
          }
          return (
            <div key={s.key} className="text-xs">
              <label className="flex items-center gap-2">
                <span className="w-14 text-slate-400">{s.label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="w-16 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-right font-mono text-slate-100 tabular-nums"
                  value={vals[s.key] ?? ""}
                  placeholder="—"
                  onInput={(e) => {
                    const value = (e.target as HTMLInputElement).value;
                    setVals((v: Record<string, string>) => ({ ...v, [s.key]: value }));
                  }}
                />
                <span className="min-w-[3.5rem] font-mono text-[10px] text-slate-500 tabular-nums">
                  {sugAtLevel != null ? `~${sugAtLevel}` : ""}
                  {flag && <span className={`ml-0.5 ${flag.cls}`}>{flag.sym}</span>}
                </span>
              </label>
              {!atMax && stores != null && (
                <div className="pl-16 text-[10px] font-mono text-slate-500 tabular-nums">
                  → stores {stores}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] leading-snug text-slate-600">
        Core-stat value (Warrior): 1 STR ≈ 0.72 dmg · 1 CON ≈ 18 HP · 1 AGI ≈ 0.15
        dmg. Base-gear core stats add on top of hp/damage — trim flat values if a
        slot leans hard into one.
      </p>

      <button
        type="button"
        className="mt-3 rounded bg-sky-700 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-600"
        onClick={apply}
      >
        Write level-{MAX_LEVEL} values{atMax ? "" : ` (from level ${level})`}
      </button>
    </div>
  );
}
