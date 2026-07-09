// Per-slot suggested BASE stats for equipment, from the scaling-rework design's
// equipment budget (values at max level = 50). Under "author-at-max" scaling,
// an item pub's base value IS its max-level value; the world scales it DOWN for
// lower-level drops (contribution = base × curve(dropLevel) / curve(50)). So
// these are the numbers to put directly in the item pub.
//
// Source of truth: vault design note "Scaling rework — curves, NPC anchoring,
// mods, level-ups" (Equipment budget). At runtime, damage + accuracy scale on
// offense_curve and hp + armor + evade on survivability_curve. These values are
// authoring GUIDANCE (starting points from the ~50% gear half of Expected
// Player Power split across the 15 equip slots) — not enforced.

export interface SuggestedStats {
  slot: string;
  hp?: number;
  minDamage?: number;
  maxDamage?: number;
  armor?: number;
  accuracy?: number;
  evade?: number;
  /** Extra context, e.g. "per ring (2 slots)". */
  note?: string;
}

// Keyed by the item `type` enum value (10 = Weapon … 21 = Bracer). Non-equipment
// types (General/Heal/Key/etc.) have no entry, so no card is shown.
export const SUGGESTED_ITEM_STATS: Record<number, SuggestedStats> = {
  10: { slot: "Weapon", minDamage: 240, maxDamage: 300, accuracy: 280 },
  11: { slot: "Shield", hp: 360, armor: 36, minDamage: 12, maxDamage: 16, accuracy: 40 },
  12: { slot: "Armor (chest)", hp: 780, armor: 45, minDamage: 8, maxDamage: 10 },
  13: { slot: "Hat", hp: 360, armor: 18, accuracy: 40 },
  14: { slot: "Boots", hp: 300, armor: 12 },
  15: { slot: "Gloves", hp: 240, armor: 12, minDamage: 20, maxDamage: 26, accuracy: 120 },
  16: { slot: "Accessory", hp: 120, armor: 3, minDamage: 16, maxDamage: 20, accuracy: 40 },
  17: { slot: "Belt", hp: 240, armor: 12 },
  18: { slot: "Necklace", hp: 180, armor: 3, minDamage: 20, maxDamage: 26, accuracy: 40 },
  19: { slot: "Ring", hp: 30, armor: 1, minDamage: 15, maxDamage: 19, accuracy: 50, note: "per ring — 2 slots share the budget" },
  20: { slot: "Armlet", hp: 45, armor: 2, minDamage: 5, maxDamage: 7, accuracy: 10, note: "per armlet — 2 slots share the budget" },
  21: { slot: "Bracer", hp: 68, armor: 2, minDamage: 3, maxDamage: 5, accuracy: 10, note: "per bracer — 2 slots share the budget" },
};

export function suggestedStatsForType(type: unknown): SuggestedStats | undefined {
  if (typeof type !== "number" || !Number.isFinite(type)) return undefined;
  return SUGGESTED_ITEM_STATS[type];
}
