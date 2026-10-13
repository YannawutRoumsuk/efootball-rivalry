/** Shared API envelope used by every route handler and the client fetcher. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Client-side helper: JSON fetch that unwraps the envelope or throws ApiError. */
export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers:
        init?.body instanceof FormData
          ? init.headers
          : { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("NETWORK", "Network error — check your connection and try again.", 0);
  }

  let body: ApiResult<T> | null = null;
  try {
    body = (await res.json()) as ApiResult<T>;
  } catch {
    body = null;
  }
  if (!body) throw new ApiError("BAD_RESPONSE", `Unexpected server response (${res.status}).`, res.status);
  if (!body.ok) throw new ApiError(body.error.code, body.error.message, res.status, body.error.details);
  return body.data;
}
