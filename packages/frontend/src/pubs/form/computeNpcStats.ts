import { authedFetch } from "../../api/client";

export interface ComputeNpcStatsBody {
  level: number;
  hp_multiplier: number;
  damage_multiplier: number;
  exp_multiplier: number;
  defense_multiplier: number;
  boss: boolean;
}

export interface ComputeNpcStatsResponse {
  hp: number;
  damageMin: number;
  damageMax: number;
  xp: number;
  // Defensive stats now scale server-side (survivability curve). Previously
  // shown raw/unscaled in the editor.
  armor: number;
  evade: number;
  accuracy: number;
  // `curve` = offense curve (hp + xp). `survivabilityCurve` drives
  // damage + armor + evade + accuracy — used for the correct hint per stat.
  curve: number;
  survivabilityCurve: number;
  baseHp: number;
  baseMinDamage: number;
  baseMaxDamage: number;
  baseXp: number;
  baseArmor: number;
  baseEvade: number;
  baseAccuracy: number;
}

export async function computeNpcStats(
  token: string,
  body: ComputeNpcStatsBody,
  signal?: AbortSignal
): Promise<ComputeNpcStatsResponse> {
  return authedFetch<ComputeNpcStatsResponse>({
    path: "/api/compute_npc_stats",
    method: "POST",
    body,
    token,
    signal,
  });
}
