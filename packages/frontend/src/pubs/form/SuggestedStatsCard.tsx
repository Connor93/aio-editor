import { suggestedStatsForType } from "./suggestedItemStats";

interface SuggestedStatsCardProps {
  /** The parsed item draft object from the form. */
  item: Record<string, unknown>;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function SuggestedStatsCard({ item }: SuggestedStatsCardProps) {
  const s = suggestedStatsForType(item.type);
  // Not an equipment slot (General / Heal / Key / etc.) — nothing to suggest.
  if (!s) return null;

  const rows: { label: string; current: string; suggested: string }[] = [];
  if (s.hp != null) {
    rows.push({ label: "HP", current: String(num(item.hp, 0)), suggested: `+${s.hp}` });
  }
  if (s.minDamage != null || s.maxDamage != null) {
    rows.push({
      label: "Damage",
      current: `${num(item.min_damage, 0)} – ${num(item.max_damage, 0)}`,
      suggested: `${s.minDamage ?? 0} – ${s.maxDamage ?? 0}`,
    });
  }
  if (s.armor != null) {
    rows.push({ label: "Armor", current: String(num(item.armor, 0)), suggested: `+${s.armor}` });
  }
  if (s.accuracy != null) {
    rows.push({ label: "Accuracy", current: String(num(item.accuracy, 0)), suggested: `+${s.accuracy}` });
  }
  if (s.evade != null) {
    rows.push({ label: "Evade", current: String(num(item.evade, 0)), suggested: `+${s.evade}` });
  }

  return (
    <div className="mb-4 rounded-md border border-emerald-900/60 bg-slate-900 p-3 shadow-md shadow-slate-950/60">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
          Suggested base stats — {s.slot}
        </h3>
        <span className="text-[10px] text-slate-500">at max level</span>
      </div>

      <div className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-wider text-slate-500">
        <span>Stat</span>
        <span className="flex gap-6">
          <span className="w-24 text-right">Current</span>
          <span className="w-24 text-right text-emerald-400">Suggested</span>
        </span>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between text-sm">
            <span className="text-slate-400">{r.label}</span>
            <span className="flex gap-6 font-mono">
              <span className="w-24 text-right text-slate-300">{r.current}</span>
              <span className="w-24 text-right text-emerald-200">{r.suggested}</span>
            </span>
          </div>
        ))}
      </div>

      {s.note && (
        <p className="mt-2 text-[10px] text-slate-500">{s.note}</p>
      )}
      <p className="mt-2 text-[10px] leading-snug text-slate-500">
        Max-level targets from the scaling design's equipment budget (the ~50%
        gear half of expected player power, split across the 15 equip slots).
        Under <em>author-at-max</em> scaling, put these values in the pub as-is —
        the world scales them <em>down</em> for lower-level drops. Damage /
        accuracy scale on the offense curve, HP / armor on survivability.
        Guidance only; core-stat bonuses (str / int / …) are usually mod-driven,
        not base.
      </p>
    </div>
  );
}
