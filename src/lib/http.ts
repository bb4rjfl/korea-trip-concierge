import { EXTERNAL_API_TIMEOUT_MS } from "./constants.js";

export class ExternalApiError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ExternalApiError";
  }
}

/**
 * fetch() with a hard timeout (default 2.5s) so a slow upstream can never blow
 * the p99 < 3s requirement. Aborts on timeout and raises ExternalApiError.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = EXTERNAL_API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ExternalApiError(`upstream timed out after ${timeoutMs}ms`, err);
    }
    throw new ExternalApiError("upstream request failed", err);
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch JSON with timeout + one retry. Throws ExternalApiError on failure. */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (!res.ok) {
        throw new ExternalApiError(`upstream returned HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new ExternalApiError("upstream request failed");
}
