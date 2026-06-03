import { authedFetch } from "../api/client";
import type { JsonSchema } from "./form/schema";
import type { PubFile, PubFileContent, PubType } from "./types";

export async function fetchPubTypes(
  token: string,
  signal?: AbortSignal
): Promise<PubType[]> {
  const { types } = await authedFetch<{ types: PubType[] }>({
    path: "/api/pubs/types",
    token,
    signal,
  });
  return types;
}

export async function fetchPubFiles(
  type: string,
  token: string,
  signal?: AbortSignal
): Promise<PubFile[]> {
  const { files } = await authedFetch<{ files: PubFile[] }>({
    path: `/api/pubs/${encodeURIComponent(type)}`,
    token,
    signal,
  });
  return files;
}

export async function fetchPubFile(
  type: string,
  filename: string,
  token: string,
  signal?: AbortSignal
): Promise<PubFileContent> {
  return authedFetch<PubFileContent>({
    path: `/api/pubs/${encodeURIComponent(type)}/${encodeURIComponent(filename)}`,
    token,
    signal,
  });
}

export async function savePubFile(
  type: string,
  filename: string,
  content: string,
  token: string
): Promise<void> {
  await authedFetch<void>({
    path: `/api/pubs/${encodeURIComponent(type)}/${encodeURIComponent(filename)}`,
    method: "PUT",
    body: { content },
    token,
  });
}

export async function fetchSchema(
  type: string,
  token: string,
  signal?: AbortSignal
): Promise<JsonSchema> {
  return authedFetch<JsonSchema>({
    path: `/api/schemas/${encodeURIComponent(type)}`,
    token,
    signal,
  });
}
