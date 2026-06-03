export interface ApiError {
  status: number;
  message: string;
  validationErrors?: Array<{ path: string; message: string }>;
}

interface AuthedFetchArgs {
  path: string;
  method?: "GET" | "PUT" | "POST" | "DELETE";
  body?: unknown;
  token: string;
  signal?: AbortSignal;
}

export async function authedFetch<T>({
  path,
  method = "GET",
  body,
  token,
  signal,
}: AuthedFetchArgs): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let message = `${method} ${path} failed (${res.status})`;
    let validationErrors: ApiError["validationErrors"];
    try {
      const errBody = (await res.json()) as {
        error?: string;
        validationErrors?: ApiError["validationErrors"];
      };
      if (errBody.error) message = errBody.error;
      validationErrors = errBody.validationErrors;
    } catch {
      // non-JSON error body — keep generic message
    }
    throw { status: res.status, message, validationErrors } satisfies ApiError;
  }

  return (await res.json()) as T;
}
