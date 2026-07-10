// Client-side mirror of REOSERV's author-at-max item scaling, for editor
// preview + the "author at level N" converter. An item pub stores each stat at
// MAX level; the world scales it DOWN for a lower-level drop:
//   contribution(dropLevel) = base × curve(dropLevel) / curve(MAX_LEVEL)
// Damage + accuracy scale on the offense curve; everything else (hp/tp/armor/
// evade + stat bonuses) on the survivability curve — matching
// src/character/calculate_stats.rs.
//
// NOTE: these curve constants are duplicated from config/Formulas.ron for a
// cheap live preview. If the exponents or max level change server-side, update
// them here too (or move to a /admin/compute_item_stats round-trip).

export const MAX_LEVEL = 50;

const offense = (L: number) => Math.pow(Math.max(L, 1), 1.505);
const surv = (L: number) => Math.pow(Math.max(L, 1), 1.177);

const OFFENSE_STATS = new Set(["min_damage", "max_damage", "accuracy"]);

function curveFor(stat: string) {
  return OFFENSE_STATS.has(stat) ? offense : surv;
}

/** What a max-level `base` for `stat` contributes at `dropLevel`. */
export function scaledAt(stat: string, base: number, dropLevel: number): number {
  const c = curveFor(stat);
  return base * (c(dropLevel) / c(MAX_LEVEL));
}

/** The max-level base that yields `target` for `stat` at `atLevel`. */
export function baseForLevel(stat: string, target: number, atLevel: number): number {
  const c = curveFor(stat);
  return target * (c(MAX_LEVEL) / c(atLevel));
}

/** Combat stats worth previewing / converting (in display order). */
export const SCALED_STATS: { key: string; label: string }[] = [
  { key: "hp", label: "HP" },
  { key: "tp", label: "TP" },
  { key: "min_damage", label: "Min dmg" },
  { key: "max_damage", label: "Max dmg" },
  { key: "armor", label: "Armor" },
  { key: "accuracy", label: "Accuracy" },
  { key: "evade", label: "Evade" },
  // Core stats. Note INT's field key is `intl` (matches the item schema).
  // All six route through the survivability curve via curveFor (they're not
  // in OFFENSE_STATS) — matching s_def() in src/character/calculate_stats.rs.
  { key: "str", label: "STR" },
  { key: "intl", label: "INT" },
  { key: "wis", label: "WIS" },
  { key: "agi", label: "AGI" },
  { key: "con", label: "CON" },
  { key: "cha", label: "CHA" },
];

/** Core-stat keys (survivability-scaled, mostly slot-identity flavor). */
export const CORE_STATS = new Set(["str", "intl", "wis", "agi", "con", "cha"]);

/** Drop levels shown in the preview. */
export const PREVIEW_LEVELS = [1, 10, 25, MAX_LEVEL];
