import { useState } from "react";

import { suggestedStatsForType } from "./suggestedItemStats";
import {
  MAX_LEVEL,
  PREVIEW_LEVELS,
  SCALED_STATS,
  baseForLevel,
  scaledAt,
} from "./statScaling";

interface ItemScalingCardProps {
  /** Parsed item draft. */
  item: Record<string, unknown>;
  /** Merge a stat patch into the draft (used by the author-at-level converter). */
  onPatch: (patch: Record<string, number>) => void;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

const CONVERT_LEVELS = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

export function ItemScalingCard({ item, onPatch }: ItemScalingCardProps) {
  // Only equipment scales (author-at-max); potions/keys/etc. don't.
  const slot = suggestedStatsForType(item.type);
  const [level, setLevel] = useState(25);
  const [vals, setVals] = useState<Record<string, string>>({});

  if (!slot) return null;

  const active = SCALED_STATS.filter((s) => num(item[s.key], 0) !== 0);

  const loadCurrent = () => {
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
          Scaling preview — {slot.slot}
        </h3>
        <span className="text-[10px] text-slate-500">base = level {MAX_LEVEL}</span>
      </div>

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
                {PREVIEW_LEVELS.map((lv) => (
                  <th key={lv} className="pb-1 text-right font-medium tabular-nums">
                    L{lv}
                    {lv === MAX_LEVEL ? " · base" : ""}
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
                    {PREVIEW_LEVELS.map((lv) => (
                      <td key={lv} className="py-0.5 text-right font-mono tabular-nums">
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

      {/* Author-at-level converter */}
      <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-400">
        <span>Author for a level:</span>
        <select
          className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-slate-200"
          value={level}
          onChange={(e) => setLevel(Number((e.target as HTMLSelectElement).value))}
        >
          {CONVERT_LEVELS.map((lv) => (
            <option key={lv} value={lv}>
              {lv}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-300 hover:text-slate-100"
          onClick={loadCurrent}
        >
          Load current
        </button>
      </div>
      <p className="mb-2 text-[10px] leading-snug text-slate-500">
        Type the stats you want the item to have <em>at level {level}</em>; “Set base
        stats” writes the equivalent max-level base into the item.
      </p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {SCALED_STATS.map((s) => (
          <label key={s.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-400">{s.label}</span>
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
          </label>
        ))}
      </div>

      <button
        type="button"
        className="mt-3 rounded bg-sky-700 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-600"
        onClick={apply}
      >
        Set base stats (from level {level})
      </button>
    </div>
  );
}
