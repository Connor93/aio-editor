// Per-slot suggested BASE stats for equipment, from the scaling-rework design's
// equipment budget (values at max level = 50). Under "author-at-max" scaling,
// an item pub's base value IS its max-level value; the world scales it DOWN for
// lower-level drops (contribution = base × curve(dropLevel) / curve(50)). So
// these are the numbers to put directly in the item pub.
//
// Source of truth: vault design notes "Scaling rework — curves, NPC anchoring,
// mods, level-ups" (Equipment budget) and "Item stat authoring in AIO editor"
// (TP + core-stat budgets). At runtime, damage + accuracy scale on
// offense_curve and everything else (hp/tp/armor/evade + the six core stats) on
// survivability_curve. These values are authoring GUIDANCE (starting points
// from the ~50% gear half of Expected Player Power split across the 15 equip
// slots) — not enforced.
//
// KEYS ARE snake_case to match the item schema field keys and statScaling's
// SCALED_STATS (INT's key is `intl`), so a converter/form lookup can index
// `slot[fieldKey]` directly. Core stats are flavor-tier: a slot-identity layer
// (weapon→STR, armor→CON, jewelry→INT/WIS) on top of the hp/damage budget, NOT
// a primary power source. Base-gear core stats are potent (1 CON ≈ 18 HP,
// 1 STR ≈ 0.72 Warrior dmg) — keep them modest and trim flat hp/damage if a
// slot leans hard into a core stat.

export interface SuggestedStats {
  slot: string;
  hp?: number;
  tp?: number;
  min_damage?: number;
  max_damage?: number;
  armor?: number;
  accuracy?: number;
  evade?: number;
  str?: number;
  intl?: number;
  wis?: number;
  agi?: number;
  con?: number;
  cha?: number;
  /** Extra context, e.g. "per ring (2 slots)". */
  note?: string;
}

// Keyed by the item `type` enum value (10 = Weapon … 21 = Bracer). Non-equipment
// types (General/Heal/Key/etc.) have no entry, so no card is shown.
export const SUGGESTED_ITEM_STATS: Record<number, SuggestedStats> = {
  10: { slot: "Weapon", min_damage: 240, max_damage: 300, accuracy: 280, str: 24, agi: 6, tp: 40 },
  11: { slot: "Shield", hp: 360, armor: 36, min_damage: 12, max_damage: 16, accuracy: 40, con: 16, str: 4, tp: 20 },
  12: { slot: "Armor (chest)", hp: 780, armor: 45, min_damage: 8, max_damage: 10, con: 20, str: 8, tp: 40 },
  13: { slot: "Hat", hp: 360, armor: 18, accuracy: 40, con: 10, intl: 10, wis: 6, tp: 80 },
  14: { slot: "Boots", hp: 300, armor: 12, agi: 14, con: 6, tp: 20 },
  15: { slot: "Gloves", hp: 240, armor: 12, min_damage: 20, max_damage: 26, accuracy: 120, str: 14, agi: 10, tp: 20 },
  16: { slot: "Accessory", hp: 120, armor: 3, min_damage: 16, max_damage: 20, accuracy: 40, intl: 10, agi: 6, str: 4, tp: 120 },
  17: { slot: "Belt", hp: 240, armor: 12, con: 14, str: 6, tp: 40 },
  18: { slot: "Necklace", hp: 180, armor: 3, min_damage: 20, max_damage: 26, accuracy: 40, intl: 16, wis: 12, tp: 200 },
  19: { slot: "Ring", hp: 30, armor: 1, min_damage: 15, max_damage: 19, accuracy: 50, intl: 8, str: 6, agi: 6, con: 6, tp: 60, note: "per ring — 2 slots share the budget" },
  20: { slot: "Armlet", hp: 45, armor: 2, min_damage: 5, max_damage: 7, accuracy: 10, wis: 6, con: 5, intl: 4, tp: 40, note: "per armlet — 2 slots share the budget" },
  21: { slot: "Bracer", hp: 68, armor: 2, min_damage: 3, max_damage: 5, accuracy: 10, str: 6, agi: 6, con: 4, tp: 20, note: "per bracer — 2 slots share the budget" },
};

export function suggestedStatsForType(type: unknown): SuggestedStats | undefined {
  if (typeof type !== "number" || !Number.isFinite(type)) return undefined;
  return SUGGESTED_ITEM_STATS[type];
}

/** Suggested max-level base for a stat key on a slot, or undefined if unbudgeted. */
export function suggestedFor(slot: SuggestedStats, key: string): number | undefined {
  const v = (slot as unknown as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
