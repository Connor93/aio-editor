import { authedFetch } from "../api/client";

export type Rarity = "common" | "rare" | "epic" | "legendary";

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
  mods: RolledMod[];
}

export interface SimulateRollResponse {
  rolls: RolledItem[];
}

export async function simulateRolls(
  token: string,
  body: { item_level: number; rarity: Rarity; count: number }
): Promise<SimulateRollResponse> {
  return authedFetch<SimulateRollResponse>({
    path: "/api/simulate_roll",
    method: "POST",
    body,
    token,
  });
}
