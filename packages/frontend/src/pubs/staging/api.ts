import { authedFetch } from "../../api/client";

export interface StagedFileEntry {
  type: string;
  filename: string;
  bytes: number;
  modifiedAt: string;
}

export interface PubFileDiff {
  type: string;
  filename: string;
  live: string | null;
  staging: string | null;
}

export interface PushResult {
  pushed: Array<{ type: string; filename: string }>;
  errors: Array<{ type: string; filename: string; message: string }>;
}

export async function fetchStaging(
  token: string,
  signal?: AbortSignal
): Promise<StagedFileEntry[]> {
  const { files } = await authedFetch<{ files: StagedFileEntry[] }>({
    path: "/api/staging",
    token,
    signal,
  });
  return files;
}

export async function fetchDiff(
  type: string,
  filename: string,
  token: string,
  signal?: AbortSignal
): Promise<PubFileDiff> {
  return authedFetch<PubFileDiff>({
    path: `/api/pubs/${encodeURIComponent(type)}/${encodeURIComponent(filename)}/diff`,
    token,
    signal,
  });
}

export async function pushStaged(
  files: Array<{ type: string; filename: string }> | "all",
  token: string
): Promise<PushResult> {
  const body = files === "all" ? { all: true } : { files };
  return authedFetch<PushResult>({
    path: "/api/staging/push",
    method: "POST",
    body,
    token,
  });
}

export async function discardStaged(
  type: string,
  filename: string,
  token: string
): Promise<void> {
  await authedFetch<void>({
    path: `/api/staging/${encodeURIComponent(type)}/${encodeURIComponent(filename)}`,
    method: "DELETE",
    token,
  });
}
