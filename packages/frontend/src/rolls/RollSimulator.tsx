import { useMemo, useState } from "react";

import type { ApiError } from "../api/client";
import {
  type ItemCategory,
  type Rarity,
  type RarityWeights,
  type RolledItem,
  type SimulateRollBody,
  simulateRolls,
} from "./api";
import { Histogram } from "./Histogram";

const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
const ITEM_CATEGORIES: ItemCategory[] = ["weapon", "armor", "accessory"];

const DEFAULT_WEIGHTS: RarityWeights = {
  common: 0.7,
  rare: 0.22,
  epic: 0.07,
  legendary: 0.01,
};

type RarityMode = "pinned" | "weights";

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
  const [count, setCount] = useState(500);
  const [rarityMode, setRarityMode] = useState<RarityMode>("pinned");
  const [rarity, setRarity] = useState<Rarity>("rare");
  const [weights, setWeights] = useState<RarityWeights>(DEFAULT_WEIGHTS);
  const [magicFind, setMagicFind] = useState(1.0);
  const [results, setResults] = useState<RolledItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const body: SimulateRollBody = {
        item_level: itemLevel,
        item_category: itemCategory,
        count,
      };
      if (rarityMode === "pinned") {
        body.rarity = rarity;
      } else {
        body.rarity_weights = weights;
        body.magic_find = magicFind;
      }
      const res = await simulateRolls(token, body);
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

  // Per-rarity counts (for the rarity-distribution chip row in weights mode).
  const rarityCounts = useMemo(() => {
    const c: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (const item of results) c[item.rarity]++;
    return c;
  }, [results]);

  // Group rolled mods by mod_id for the per-mod histograms.
  const perMod = useMemo(() => {
    const m = new Map<string, ModBucket>();
    for (const item of results) {
      for (const mod of item.mods) {
        const entry = m.get(mod.mod_id) ?? {
          name: mod.name,
          values: [],
          low: mod.scaled_low,
          high: mod.scaled_high,
        };
        entry.values.push(mod.rolled_value);
        m.set(mod.mod_id, entry);
      }
    }
    return m;
  }, [results]);

  const sortedEntries = Array.from(perMod.entries()).sort(
    (a, b) => b[1].values.length - a[1].values.length
  );

  const weightSum = weights.common + weights.rare + weights.epic + weights.legendary;
  const weightSumOff = Math.abs(weightSum - 1) > 0.01;

  return (
    <div className="h-full overflow-auto p-6">
      <h1 className="mb-1 text-xl font-semibold text-slate-100">Roll simulator</h1>
      <p className="mb-6 text-sm text-slate-400">
        Validate the modifier pool before Phase 4 Item Instancing call sites consume it.
        Pinned rarity rolls every item at the chosen tier (mod-pool validation); rarity
        weights samples each item's tier from the distribution (drop-rate validation).
      </p>

      <div className="mb-6 space-y-3 rounded border border-slate-800 bg-slate-900/40 p-3">
        <div className="flex flex-wrap items-end gap-3">
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
                <option key={c} value={c}>{c}</option>
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
            disabled={loading || (rarityMode === "weights" && weightSumOff)}
            className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? "Rolling…" : "Run simulation"}
          </button>
        </div>

        <div className="border-t border-slate-800 pt-3">
          <div className="mb-2 flex items-center gap-3 text-xs text-slate-400">
            Rarity mode
            <div className="inline-flex rounded border border-slate-700">
              <ModeButton
                active={rarityMode === "pinned"}
                onClick={() => setRarityMode("pinned")}
                label="Pinned"
              />
              <ModeButton
                active={rarityMode === "weights"}
                onClick={() => setRarityMode("weights")}
                label="From weights"
              />
            </div>
          </div>

          {rarityMode === "pinned" ? (
            <label className="flex flex-col text-xs text-slate-400">
              Rarity
              <select
                value={rarity}
                onChange={(e) => setRarity(e.target.value as Rarity)}
                className="mt-1 w-32 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              >
                {RARITIES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              {(["common", "rare", "epic", "legendary"] as const).map((r) => (
                <label key={r} className="flex flex-col text-xs text-slate-400">
                  {r}
                  <input
                    type="number"
                    step={0.01}
                    min={0}
                    max={1}
                    value={weights[r]}
                    onChange={(e) =>
                      setWeights((w) => ({ ...w, [r]: parseFloat(e.target.value) || 0 }))
                    }
                    className="mt-1 w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                  />
                </label>
              ))}
              <label className="flex flex-col text-xs text-slate-400">
                Magic find (1.0 = none)
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={magicFind}
                  onChange={(e) => setMagicFind(parseFloat(e.target.value) || 1)}
                  className="mt-1 w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                />
              </label>
              <div className={`text-xs ${weightSumOff ? "text-amber-400" : "text-slate-500"}`}>
                sum = {weightSum.toFixed(3)}
                {weightSumOff && " (should be 1.0)"}
              </div>
            </div>
          )}
        </div>
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
          {rarityMode === "weights" && (
            <div className="flex flex-wrap gap-2 rounded border border-slate-800 bg-slate-950/50 p-3 text-xs">
              <span className="text-slate-400">Rarity distribution:</span>
              {(["common", "rare", "epic", "legendary"] as const).map((r) => {
                const pct = results.length > 0 ? (rarityCounts[r] / results.length) * 100 : 0;
                return (
                  <span key={r} className="rounded bg-slate-900 px-2 py-0.5 font-mono">
                    {r} {rarityCounts[r]} ({pct.toFixed(1)}%)
                  </span>
                );
              })}
            </div>
          )}
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

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs transition-colors first:rounded-l last:rounded-r ${
        active
          ? "bg-slate-700 text-white"
          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}
