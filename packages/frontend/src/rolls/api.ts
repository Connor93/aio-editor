import { authedFetch } from "../api/client";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export type ItemCategory = "weapon" | "armor" | "accessory";

export interface RarityWeights {
  common: number;
  rare: number;
  epic: number;
  legendary: number;
}

export interface RolledMod {
  mod_id: string;
  name: string;
  rolled_value: number;
  scaled_low: number;
  scaled_high: number;
}

export interface RolledItem {
  item_level: number;
  rarity: Rarity;
  item_category: ItemCategory;
  mods: RolledMod[];
}

export interface SimulateRollResponse {
  rolls: RolledItem[];
}

export interface SimulateRollBody {
  item_level: number;
  item_category: ItemCategory;
  count: number;
  /** Either rarity (pinned) or rarity_weights (sampled per roll). */
  rarity?: Rarity;
  rarity_weights?: RarityWeights;
  /** Only meaningful with rarity_weights. 1.0 = no bias; >1.0 skews
   *  toward higher rarities per the magic_find formula. */
  magic_find?: number;
}

export async function simulateRolls(
  token: string,
  body: SimulateRollBody
): Promise<SimulateRollResponse> {
  return authedFetch<SimulateRollResponse>({
    path: "/api/simulate_roll",
    method: "POST",
    body,
    token,
  });
}
