interface HistogramProps {
  values: number[];
  buckets: number;
  scaledLow: number;
  scaledHigh: number;
  label: string;
}

/** Simple bar-chart histogram. Buckets values into N equal-width bins
 *  across [scaledLow, scaledHigh] and renders bars whose heights are
 *  proportional to the per-bucket counts. Mid-weighted triangular
 *  distributions show up as a clear hump in the middle. */
export function Histogram({
  values,
  buckets,
  scaledLow,
  scaledHigh,
  label,
}: HistogramProps) {
  if (values.length === 0) {
    return <div className="text-sm text-slate-400">No rolls.</div>;
  }

  // Resistance / damage-reduction mods have negative ranges (low <= high
  // still holds but both ends are negative). Normalise so the bar layout
  // always reads left-to-right as "smaller absolute → larger absolute".
  const lo = Math.min(scaledLow, scaledHigh);
  const hi = Math.max(scaledLow, scaledHigh);
  const range = hi - lo || 1;

  const counts = new Array(buckets).fill(0);
  for (const v of values) {
    const idx = Math.min(
      buckets - 1,
      Math.max(0, Math.floor(((v - lo) / range) * buckets))
    );
    counts[idx]++;
  }
  const maxCount = Math.max(...counts);

  // values.length > 0 by the early-return above, so sorted[i] is defined.
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-slate-300">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-slate-500">
          {lo.toFixed(2)} → {hi.toFixed(2)}
        </span>
      </div>
      <div className="flex h-24 items-end gap-px rounded bg-slate-900 px-1 py-1">
        {counts.map((c, i) => (
          <div
            key={i}
            title={`${c} rolls`}
            className="flex-1 bg-emerald-500/70"
            style={{
              height: maxCount > 0 ? `${(c / maxCount) * 100}%` : "0%",
              minHeight: c > 0 ? "1px" : 0,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between gap-3 font-mono text-[10px] text-slate-500">
        <span>min {min.toFixed(2)}</span>
        <span>median {median.toFixed(2)}</span>
        <span>max {max.toFixed(2)}</span>
      </div>
    </div>
  );
}
