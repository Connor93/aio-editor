import { authedFetch } from "../../api/client";

export interface ComputeNpcStatsBody {
  level: number;
  hp_multiplier: number;
  damage_multiplier: number;
  exp_multiplier: number;
}

export interface ComputeNpcStatsResponse {
  hp: number;
  damageMin: number;
  damageMax: number;
  xp: number;
  curve: number;
  baseHp: number;
  baseMinDamage: number;
  baseMaxDamage: number;
  baseXp: number;
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
