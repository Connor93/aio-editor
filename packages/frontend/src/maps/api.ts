import { authedFetch, type ApiError } from "../api/client";

export async function fetchMapIds(token: string, signal?: AbortSignal): Promise<number[]> {
  const { ids } = await authedFetch<{ ids: number[] }>({
    path: "/api/maps",
    token,
    signal,
  });
  return ids;
}

export interface UploadResult {
  map_id: number;
  reloaded: boolean;
}

/** Multipart upload — can't use authedFetch (which forces a JSON body). The
 *  browser sets the multipart Content-Type + boundary automatically when the
 *  body is a FormData, so we only attach the Bearer token. */
export async function uploadMap(
  file: File,
  mapId: number,
  token: string,
): Promise<UploadResult> {
  const form = new FormData();
  form.append("map_id", String(mapId));
  form.append("file", file);

  const res = await fetch("/api/maps/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    let message = `upload failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error body — keep generic message
    }
    throw { status: res.status, message } satisfies ApiError;
  }
  return (await res.json()) as UploadResult;
}
