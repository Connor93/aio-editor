import type { UsageEntry, UsageKind, UsageRef } from "./api";

const KIND_LABELS: Record<UsageKind, string> = {
  shop: "Shops",
  craft: "Crafts",
  drop: "Drops",
  globalDrop: "Global drops",
  chest: "Chests",
  quest: "Quests",
  starterKit: "Starter kit",
  config: "Config",
  spawn: "Maps",
};

// Item reference kinds, in display order. `spawn` is NPC-only (handled by the
// spawn card), so it's absent here.
const ITEM_KIND_ORDER: UsageKind[] = [
  "shop",
  "craft",
  "drop",
  "globalDrop",
  "chest",
  "quest",
  "starterKit",
  "config",
];

/** The browsable pub file a ref points at, or null if it isn't a pub file
 *  (map chests/spawns are `.emf`, quests are `.eqf`, config/global/starter
 *  have no target). Shop file id == its sorted position; NPC id == its file. */
function pubTarget(ref: UsageRef): { type: string; id: number } | null {
  if (ref.refId == null) return null;
  switch (ref.kind) {
    case "shop":
    case "craft":
      return { type: "shops", id: ref.refId };
    case "drop":
      return { type: "npcs", id: ref.refId };
    default:
      return null;
  }
}

interface UsageCardProps {
  /** The usage entry for the selected file, or undefined if unreferenced. */
  entry: UsageEntry | undefined;
  kind: "items" | "npcs";
  /** Jump the editor to a pub file (type + numeric id). */
  onNavigate: (type: string, id: number) => void;
}

const CARD =
  "mb-4 rounded-md border border-slate-800 bg-slate-900 p-3 shadow-md shadow-slate-950/60";

export function UsageCard({ entry, kind, onNavigate }: UsageCardProps) {
  const refs = entry?.refs ?? [];
  return kind === "npcs" ? (
    <SpawnCard refs={refs} />
  ) : (
    <UsedInCard refs={refs} onNavigate={onNavigate} />
  );
}

function UsedInCard({
  refs,
  onNavigate,
}: {
  refs: UsageRef[];
  onNavigate: (type: string, id: number) => void;
}) {
  const groups = new Map<UsageKind, UsageRef[]>();
  for (const r of refs) {
    const list = groups.get(r.kind) ?? [];
    list.push(r);
    groups.set(r.kind, list);
  }
  const ordered = ITEM_KIND_ORDER.filter((k) => groups.has(k));

  return (
    <div className={CARD}>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Used in
        </h3>
        <span className="text-[10px] text-slate-500">
          {refs.length} reference{refs.length === 1 ? "" : "s"}
        </span>
      </div>

      {refs.length === 0 ? (
        <p className="text-sm text-amber-400/90">
          Not referenced anywhere — this item is an orphan (safe to remove).
        </p>
      ) : (
        <div className="space-y-2">
          {ordered.map((kind) => {
            const list = groups.get(kind)!;
            return (
              <div key={kind}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {KIND_LABELS[kind]} ({list.length})
                </div>
                <ul className="flex flex-wrap gap-1">
                  {list.map((r, i) => {
                    const target = pubTarget(r);
                    const label =
                      r.role === "ingredient" ? `${r.label} · ingredient` : r.label;
                    return (
                      <li key={i}>
                        {target ? (
                          <button
                            type="button"
                            onClick={() => onNavigate(target.type, target.id)}
                            className="rounded border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-xs text-sky-300 transition-colors hover:bg-slate-700 hover:text-sky-200"
                            title={`Open ${target.type}/${String(target.id).padStart(4, "0")}.json`}
                          >
                            {label}
                          </button>
                        ) : (
                          <span className="rounded border border-slate-800 bg-slate-800/30 px-1.5 py-0.5 text-xs text-slate-300">
                            {label}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SpawnCard({ refs }: { refs: UsageRef[] }) {
  const totalSpawns = refs.reduce((n, r) => n + (r.count ?? 0), 0);
  return (
    <div className={CARD}>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Spawn locations
        </h3>
        {refs.length > 0 && (
          <span className="text-[10px] text-slate-500">
            {refs.length} map{refs.length === 1 ? "" : "s"} · {totalSpawns} total
          </span>
        )}
      </div>

      {refs.length === 0 ? (
        <p className="text-sm text-amber-400/90">
          Does not spawn on any map — this NPC is an orphan.
        </p>
      ) : (
        <ul className="space-y-1">
          {refs.map((r, i) => (
            <li
              key={i}
              className="flex items-baseline justify-between text-sm"
            >
              <span className="text-slate-200">
                {r.label}{" "}
                <span className="text-slate-500">(map {r.refId})</span>
              </span>
              <span className="font-mono text-slate-400">×{r.count ?? 0}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
