import { useState } from "react";

import type { ApiError } from "../api/client";
import {
  type ItemCategory,
  type Rarity,
  type RolledItem,
  simulateRolls,
} from "./api";
import { Histogram } from "./Histogram";

const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
const ITEM_CATEGORIES: ItemCategory[] = ["weapon", "armor", "accessory"];

interface RollSimulatorProps {
  token: string;
  onUnauthorized: () => void;
}

interface ModBucket {
  name: string;
  values: number[];
  low: number;
  high: number;
}

export function RollSimulator({ token, onUnauthorized }: RollSimulatorProps) {
  const [itemLevel, setItemLevel] = useState(25);
  const [itemCategory, setItemCategory] = useState<ItemCategory>("weapon");
  const [rarity, setRarity] = useState<Rarity>("rare");
  const [count, setCount] = useState(500);
  const [results, setResults] = useState<RolledItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await simulateRolls(token, {
        item_level: itemLevel,
        item_category: itemCategory,
        rarity,
        count,
      });
      setResults(res.rolls);
    } catch (e) {
      const err = e as ApiError;
      if (err?.status === 401) {
        onUnauthorized();
      } else {
        setError(err?.message ?? "Simulation failed");
      }
    } finally {
      setLoading(false);
    }
  };

  // Group rolls by mod_id for the per-mod histograms.
  const perMod = new Map<string, ModBucket>();
  for (const item of results) {
    for (const m of item.mods) {
      const entry = perMod.get(m.mod_id) ?? {
        name: m.name,
        values: [],
        low: m.scaled_low,
        high: m.scaled_high,
      };
      entry.values.push(m.rolled_value);
      perMod.set(m.mod_id, entry);
    }
  }

  // Sort histograms by frequency (most-rolled first) so designers see the
  // common cases at the top and tail mods at the bottom.
  const sortedEntries = Array.from(perMod.entries()).sort(
    (a, b) => b[1].values.length - a[1].values.length
  );

  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="mb-1 text-xl font-semibold text-slate-100">
        Roll simulator
      </h1>
      <p className="mb-6 text-sm text-slate-400">
        Validate the modifier pool before Phase 4 Item Instancing call sites
        consume it. Each run rolls N items and groups the rolled values per mod
        — the triangular distribution should show up as a hump in the middle of
        each histogram.
      </p>

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded border border-slate-800 bg-slate-900/40 p-3">
        <label className="flex flex-col text-xs text-slate-400">
          Item level
          <input
            type="number"
            min={1}
            max={50}
            value={itemLevel}
            onChange={(e) => setItemLevel(parseInt(e.target.value) || 1)}
            className="mt-1 w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-400">
          Item category
          <select
            value={itemCategory}
            onChange={(e) => setItemCategory(e.target.value as ItemCategory)}
            className="mt-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          >
            {ITEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-400">
          Rarity
          <select
            value={rarity}
            onChange={(e) => setRarity(e.target.value as Rarity)}
            className="mt-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          >
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-slate-400">
          Number of rolls
          <input
            type="number"
            min={1}
            max={10000}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            className="mt-1 w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          />
        </label>
        <button
          onClick={run}
          disabled={loading}
          className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Rolling…" : "Run simulation"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            {results.length} rolls · {perMod.size} unique mods seen
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedEntries.map(([modId, entry]) => (
              <div
                key={modId}
                className="rounded border border-slate-800 bg-slate-950/50 p-3"
              >
                <Histogram
                  values={entry.values}
                  buckets={20}
                  scaledLow={entry.low}
                  scaledHigh={entry.high}
                  label={`${entry.name} (${modId}) — ${entry.values.length} rolls`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
