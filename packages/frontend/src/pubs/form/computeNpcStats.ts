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
  // `curve` = offense curve (hp + xp).
  curve: number;
  baseHp: number;
  baseMinDamage: number;
  baseMaxDamage: number;
  baseXp: number;
  // Fields below are optional: a REOSERV build that predates the scaling
  // rework won't return them. The card must render without them (and prompt
  // to update the server) rather than crash.
  armor?: number;
  evade?: number;
  accuracy?: number;
  // Drives damage + armor + evade + accuracy scaling; used for their hints.
  survivabilityCurve?: number;
  baseArmor?: number;
  baseEvade?: number;
  baseAccuracy?: number;
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
