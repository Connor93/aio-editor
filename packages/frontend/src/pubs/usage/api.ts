import { authedFetch } from "../../api/client";

export type UsageKind =
  | "shop"
  | "craft"
  | "drop"
  | "globalDrop"
  | "chest"
  | "quest"
  | "starterKit"
  | "config"
  | "spawn";

export interface UsageRef {
  kind: UsageKind;
  refId?: number;
  label: string;
  role?: "result" | "ingredient";
  count?: number;
}

export interface UsageEntry {
  refs: UsageRef[];
}

export interface UsageReport {
  items: Record<string, UsageEntry>;
  npcs: Record<string, UsageEntry>;
}

export async function fetchUsage(
  token: string,
  signal?: AbortSignal
): Promise<UsageReport> {
  return authedFetch<UsageReport>({ path: "/api/usage", token, signal });
}
