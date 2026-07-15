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

const KIND_ORDER: UsageKind[] = [
  "shop",
  "craft",
  "drop",
  "globalDrop",
  "chest",
  "quest",
  "starterKit",
  "config",
  "spawn",
];

const MAX_NAMES = 8;

/** Grouped multi-line "where" summary for the dot's native tooltip. */
function buildTitle(refs: UsageRef[]): string {
  const groups = new Map<UsageKind, string[]>();
  for (const r of refs) {
    const list = groups.get(r.kind) ?? [];
    const suffix = r.count && r.count > 1 ? ` (×${r.count})` : "";
    list.push(`${r.label}${suffix}`);
    groups.set(r.kind, list);
  }
  const lines: string[] = [];
  for (const kind of KIND_ORDER) {
    const list = groups.get(kind);
    if (!list) continue;
    const shown = list.slice(0, MAX_NAMES);
    const extra = list.length - shown.length;
    lines.push(
      `${KIND_LABELS[kind]} (${list.length}): ${shown.join(", ")}${
        extra > 0 ? ` +${extra} more` : ""
      }`
    );
  }
  return lines.join("\n");
}

export function UsageDot({ entry }: { entry: UsageEntry | undefined }) {
  const used = !!entry && entry.refs.length > 0;
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
        used ? "bg-emerald-500" : "bg-slate-600"
      }`}
      title={used ? buildTitle(entry!.refs) : "unused"}
    />
  );
}
